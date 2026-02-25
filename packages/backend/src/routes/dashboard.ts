import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import {
  budgetTransactions,
  currencyRates,
  holdingTransactions,
  holdings,
  mortgageTransactions,
  mortgages,
  payslips,
  pensionPots,
  pensionTransactions,
  propertyTransactions,
  properties,
  savingsAccounts,
  savingsTransactions,
  netWorthSnapshots,
} from "../db/schema";
import { getAuthUser } from "../lib/authUser";

const app = new Hono();
const BASE_CURRENCY = "EUR";

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const monthName = (date = new Date()) =>
  date.toLocaleDateString("en-US", { month: "long" });

const monthOrder: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

const monthIndex = (month: string) => monthOrder[month.toLowerCase()] ?? -1;

async function getRatesToBaseCurrency() {
  const rows = await db
    .select({ fromCurrency: currencyRates.fromCurrency, rate: currencyRates.rate })
    .from(currencyRates)
    .where(eq(currencyRates.toCurrency, BASE_CURRENCY));

  const rates = new Map<string, number>();
  for (const row of rows) {
    rates.set(row.fromCurrency, toNumber(row.rate));
  }
  rates.set(BASE_CURRENCY, 1);
  return rates;
}

const convertToBase = (amount: number, currency: string, rates: Map<string, number>) => {
  const rate = rates.get(currency) ?? 1;
  return amount * rate;
};

type DerivedAllocation = {
  id: number;
  name: string;
  value: number;
  color: string;
  snapshotId: number;
};

async function buildDerivedAllocations(userId: number): Promise<DerivedAllocation[]> {
  const [rates, userSavings, userHoldings, userHoldingTxns, userProperties, userPensions, userMortgages] =
    await Promise.all([
      getRatesToBaseCurrency(),
      db.select().from(savingsAccounts).where(eq(savingsAccounts.userId, userId)),
      db.select().from(holdings).where(eq(holdings.userId, userId)),
      db.select().from(holdingTransactions).where(eq(holdingTransactions.userId, userId)),
      db.select().from(properties).where(eq(properties.userId, userId)),
      db.select().from(pensionPots).where(eq(pensionPots.userId, userId)),
      db.select().from(mortgages).where(eq(mortgages.userId, userId)),
    ]);

  const savingsTotal = userSavings.reduce(
    (sum, account) => sum + convertToBase(toNumber(account.balance), account.currency, rates),
    0,
  );

  const sharesByHolding = new Map<number, number>();
  for (const txn of userHoldingTxns) {
    const existing = sharesByHolding.get(txn.holdingId) ?? 0;
    const shares = toNumber(txn.shares);
    if (txn.type === "buy") {
      sharesByHolding.set(txn.holdingId, existing + shares);
    } else if (txn.type === "sell") {
      sharesByHolding.set(txn.holdingId, existing - shares);
    }
  }

  const brokerageTotal = userHoldings.reduce((sum, holding) => {
    const shares = Math.max(0, sharesByHolding.get(holding.id) ?? 0);
    const value = shares * toNumber(holding.currentPrice);
    return sum + convertToBase(value, holding.currency, rates);
  }, 0);

  const mortgageBalanceById = new Map<number, number>();
  for (const mortgage of userMortgages) {
    mortgageBalanceById.set(mortgage.id, toNumber(mortgage.outstandingBalance));
  }

  const propertyEquityTotal = userProperties.reduce((sum, property) => {
    const linkedBalance = property.mortgageId
      ? mortgageBalanceById.get(property.mortgageId)
      : undefined;
    const mortgageBalance = linkedBalance ?? toNumber(property.mortgage);
    const equity = toNumber(property.currentValue) - mortgageBalance;
    return sum + convertToBase(equity, property.currency, rates);
  }, 0);

  const pensionTotal = userPensions.reduce(
    (sum, pot) => sum + convertToBase(toNumber(pot.balance), pot.currency, rates),
    0,
  );

  return [
    { id: 1, name: "Savings", value: savingsTotal, color: "#6366f1", snapshotId: 1 },
    { id: 2, name: "Brokerage", value: brokerageTotal, color: "#0ea5e9", snapshotId: 1 },
    { id: 3, name: "Property Equity", value: propertyEquityTotal, color: "#10b981", snapshotId: 1 },
    { id: 4, name: "Pension", value: pensionTotal, color: "#f59e0b", snapshotId: 1 },
  ];
}

app.get("/net-worth", async (c) => {
  const user = getAuthUser(c);
  const [snapshots, allocations] = await Promise.all([
    db.select().from(netWorthSnapshots).where(eq(netWorthSnapshots.userId, user.id)),
    buildDerivedAllocations(user.id),
  ]);

  const sortedSnapshots = [...snapshots].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return monthIndex(a.month) - monthIndex(b.month);
  });

  if (sortedSnapshots.length > 0) {
    return c.json({
      data: sortedSnapshots.map((snapshot) => ({
        ...snapshot,
        totalValue: toNumber(snapshot.totalValue),
      })),
    });
  }

  const total = allocations.reduce((sum, item) => sum + item.value, 0);
  const now = new Date();

  return c.json({
    data: [
      {
        id: 1,
        month: monthName(now),
        year: now.getFullYear(),
        totalValue: total,
        currency: BASE_CURRENCY,
      },
    ],
  });
});

app.get("/allocations", async (c) => {
  const user = getAuthUser(c);
  const data = await buildDerivedAllocations(user.id);
  return c.json({ data });
});

app.get("/transactions", async (c) => {
  const user = getAuthUser(c);

  const [
    userPayslips,
    userBudgetTxns,
    userSavingsTxns,
    userHoldingTxns,
    userMortgageTxns,
    userPensionTxns,
    userPropertyTxns,
  ] = await Promise.all([
    db.select().from(payslips).where(eq(payslips.userId, user.id)),
    db.select().from(budgetTransactions).where(eq(budgetTransactions.userId, user.id)),
    db.select().from(savingsTransactions).where(eq(savingsTransactions.userId, user.id)),
    db.select().from(holdingTransactions).where(eq(holdingTransactions.userId, user.id)),
    db.select().from(mortgageTransactions).where(eq(mortgageTransactions.userId, user.id)),
    db.select().from(pensionTransactions).where(eq(pensionTransactions.userId, user.id)),
    db.select().from(propertyTransactions).where(eq(propertyTransactions.userId, user.id)),
  ]);

  const activity = [
    ...userPayslips.map((row) => ({
      name: `Salary ${row.month}`,
      type: "income" as const,
      amount: toNumber(row.net) + toNumber(row.bonus),
      date: row.date,
      category: "Salary",
    })),
    ...userBudgetTxns.map((row) => ({
      name: row.description,
      type: "expense" as const,
      amount: -Math.abs(toNumber(row.amount)),
      date: row.date,
      category: "Budget",
    })),
    ...userSavingsTxns.map((row) => {
      if (row.type === "interest") {
        return {
          name: row.note || "Savings interest",
          type: "income" as const,
          amount: Math.abs(toNumber(row.amount)),
          date: row.date,
          category: "Savings",
        };
      }
      const isDeposit = row.type === "deposit";
      return {
        name: row.note || (isDeposit ? "Savings deposit" : "Savings withdrawal"),
        type: "transfer" as const,
        amount: isDeposit ? -Math.abs(toNumber(row.amount)) : Math.abs(toNumber(row.amount)),
        date: row.date,
        category: "Savings",
      };
    }),
    ...userHoldingTxns.map((row) => {
      if (row.type === "dividend") {
        return {
          name: row.note || "Dividend",
          type: "income" as const,
          amount: Math.abs(toNumber(row.price)),
          date: row.date,
          category: "Investment",
        };
      }

      const gross = toNumber(row.shares) * toNumber(row.price);
      const isBuy = row.type === "buy";
      return {
        name: row.note || (isBuy ? "Investment buy" : "Investment sell"),
        type: "transfer" as const,
        amount: isBuy ? -Math.abs(gross) : Math.abs(gross),
        date: row.date,
        category: "Investment",
      };
    }),
    ...userMortgageTxns
      .filter((row) => row.type === "repayment")
      .map((row) => ({
        name: row.note || "Mortgage repayment",
        type: "expense" as const,
        amount: -Math.abs(toNumber(row.amount)),
        date: row.date,
        category: "Mortgage",
      })),
    ...userPensionTxns.map((row) => ({
      name: row.note || "Pension contribution",
      type: row.type === "fee" ? ("expense" as const) : ("transfer" as const),
      amount: -Math.abs(toNumber(row.amount)),
      date: row.date,
      category: "Pension",
    })),
    ...userPropertyTxns
      .filter((row) => row.type === "rent_income" || row.type === "expense")
      .map((row) => {
        const isIncome = row.type === "rent_income";
        return {
          name: row.note || (isIncome ? "Rent income" : "Property expense"),
          type: isIncome ? ("income" as const) : ("expense" as const),
          amount: isIncome ? Math.abs(toNumber(row.amount)) : -Math.abs(toNumber(row.amount)),
          date: row.date,
          category: "Property",
        };
      }),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 20)
    .map((row, index) => ({ id: index + 1, ...row }));

  return c.json({ data: activity });
});

export default app;
