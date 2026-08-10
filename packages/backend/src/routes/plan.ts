import {
  EMPLOYMENT_TYPES,
  isJurisdictionCode,
  resolveRule,
  toBudgetMonthIndex,
  type BudgetMonth,
  type EmploymentProfileInput,
  type EmploymentType,
  type ExpenseClass,
  type PlanAssumptionsInput,
  type RunwayResponse,
} from '@quro/shared';
import { and, desc, eq, getTableColumns, gte, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTP_STATUS } from '../constants/http';
import { db } from '../db/client';
import {
  budgetCategories,
  budgetTransactions,
  debts,
  employmentProfiles,
  holdingTransactions,
  holdings,
  mortgages,
  payslips,
  planAssumptions,
  savingsAccounts,
  savingsTransactions,
  users,
} from '../db/schema';
import { getAuthUser } from '../lib/authUser';
import { convertToBaseCurrency, FX_BASE_CURRENCY } from '../lib/currencyRateCache';
import { getCurrentRatesToBaseCurrency } from '../lib/currencyRateSync';
import { getJurisdictionProfile } from '../lib/jurisdictions';
import { getAcceptedPartnerId, ownedOrJointPredicate } from '../lib/partner';
import {
  aggregateDepositGuarantees,
  calculateBurn,
  calculateIncomeSupport,
  calculateLiquidityTiers,
  simulateRunway,
  type BudgetCategoryBurnInput,
  type LiquidAssetInput,
} from '../lib/runway';
import {
  err,
  isRecord,
  ok,
  parseOptionalBooleanField,
  parseOptionalIntegerField,
  parseOptionalNumberField,
  parsePatchFields,
  readJsonBody,
  rejectUnknownFields,
  type FieldParsers,
  type ParseResult,
} from '../lib/requestValidation';
import { CATEGORY_PRESETS } from '../services/bunqCategoryRules';

const app = new Hono();
const ISO_DATE_LENGTH = 10;
const HISTORY_MONTHS = 12;
const MONTHS_PER_YEAR = 12;
const JOINT_WEIGHT = 0.5;
const EMPLOYMENT_FIELDS = [
  'employmentType',
  'tenureMonths',
  'noticePeriodMonths',
  'hasDependents',
] as const;
const ASSUMPTION_FIELDS = [
  'leanBurnOverride',
  'emergencyLifestylePct',
  'excludedTiers',
  'countFullJointBalances',
  'benefitMonthlyOverride',
  'benefitMaxMonthsOverride',
] as const;

function toNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDateMonthsAgo(now: Date, months: number): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + 1, 1))
    .toISOString()
    .slice(0, ISO_DATE_LENGTH);
}

function parseEmploymentType(value: unknown): ParseResult<EmploymentType | null> {
  if (value === null) return ok(null);
  return typeof value === 'string' && EMPLOYMENT_TYPES.includes(value as EmploymentType)
    ? ok(value as EmploymentType)
    : err('Invalid employment type');
}

function parseExcludedTiers(value: unknown): ParseResult<number[] | null> {
  if (value === null) return ok(null);
  if (!Array.isArray(value)) return err('Excluded tiers must be an array');
  const tiers = value.filter((tier): tier is number => Number.isInteger(tier));
  return tiers.length === value.length && tiers.every((tier) => tier >= 1 && tier <= 3)
    ? ok([...new Set(tiers)])
    : err('Excluded tiers must contain only 1, 2, or 3');
}

const employmentParsers: FieldParsers<Required<EmploymentProfileInput>> = {
  employmentType: parseEmploymentType,
  tenureMonths: (value) =>
    parseOptionalIntegerField(value, 'Tenure must be 0 to 720 months', 0, 720),
  noticePeriodMonths: (value) =>
    parseOptionalIntegerField(value, 'Notice period must be 0 to 24 months', 0, 24),
  hasDependents: (value) => parseOptionalBooleanField(value, 'Dependants must be true or false'),
};

const assumptionParsers: FieldParsers<Required<PlanAssumptionsInput>> = {
  leanBurnOverride: (value) =>
    parseOptionalNumberField(value, 'Lean burn must be zero or greater', 0),
  emergencyLifestylePct: (value) => {
    const parsed = parseOptionalNumberField(
      value,
      'Lifestyle percentage must be between 0 and 1',
      0,
    );
    return parsed.ok && parsed.value !== null && parsed.value > 1
      ? err('Lifestyle percentage must be between 0 and 1')
      : parsed;
  },
  excludedTiers: parseExcludedTiers,
  countFullJointBalances: (value) =>
    parseOptionalBooleanField(value, 'Joint balance setting must be true or false'),
  benefitMonthlyOverride: (value) =>
    parseOptionalNumberField(value, 'Benefit amount must be zero or greater', 0),
  benefitMaxMonthsOverride: (value) =>
    parseOptionalIntegerField(value, 'Benefit duration must be 0 to 120 months', 0, 120),
};

async function parsePatch<T extends object>(
  request: Pick<Request, 'json'>,
  fields: readonly string[],
  parsers: FieldParsers<T>,
  errorMessage: string,
): Promise<ParseResult<Partial<T>>> {
  const raw = await readJsonBody(request, errorMessage);
  if (!raw.ok) return raw;
  if (!isRecord(raw.value)) return err(errorMessage);
  const strict = rejectUnknownFields(raw.value, fields);
  if (!strict.ok) return strict;
  const parsed = parsePatchFields(raw.value, parsers);
  return parsed.ok && Object.keys(parsed.value).length === 0 ? err('No fields provided') : parsed;
}

function sumHoldingValue(
  holdingRows: readonly (typeof holdings.$inferSelect)[],
  transactions: readonly (typeof holdingTransactions.$inferSelect)[],
  convertToEur: (amount: number, currency: string) => number,
): number {
  const shares = new Map<number, number>();
  for (const transaction of transactions) {
    const current = shares.get(transaction.holdingId) ?? 0;
    const delta = toNumber(transaction.shares);
    if (transaction.type === 'buy') shares.set(transaction.holdingId, current + delta);
    if (transaction.type === 'sell') shares.set(transaction.holdingId, current - delta);
  }
  return holdingRows.reduce(
    (sum, holding) =>
      sum +
      convertToEur(
        Math.max(0, shares.get(holding.id) ?? 0) * toNumber(holding.currentPrice),
        holding.currency,
      ),
    0,
  );
}

function buildBudgetInputs(
  categories: readonly (typeof budgetCategories.$inferSelect)[],
  transactions: ReadonlyArray<{
    categoryId: number;
    amount: number;
    date: string;
  }>,
): BudgetCategoryBurnInput[] {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const spendByNameMonth = new Map<string, Map<string, number>>();
  for (const transaction of transactions) {
    const category = categoryById.get(transaction.categoryId);
    if (!category) continue;
    const monthly = spendByNameMonth.get(category.name) ?? new Map<string, number>();
    const month = transaction.date.slice(0, 7);
    monthly.set(month, (monthly.get(month) ?? 0) + toNumber(transaction.amount));
    spendByNameMonth.set(category.name, monthly);
  }
  const latestByName = new Map<string, typeof budgetCategories.$inferSelect>();
  for (const category of categories) {
    const current = latestByName.get(category.name);
    const key = category.year * MONTHS_PER_YEAR + toBudgetMonthIndex(category.month as BudgetMonth);
    const currentKey = current
      ? current.year * MONTHS_PER_YEAR + toBudgetMonthIndex(current.month as BudgetMonth)
      : -1;
    if (!current || key > currentKey) latestByName.set(category.name, category);
  }
  const observedMonths = [
    ...new Set(
      categories.map((category) => {
        const month = toBudgetMonthIndex(category.month as BudgetMonth) + 1;
        return `${category.year}-${String(month).padStart(2, '0')}`;
      }),
    ),
  ]
    .sort()
    .slice(-HISTORY_MONTHS);
  return [...latestByName.values()].map((category) => ({
    label: category.name,
    expenseClass: category.expenseClass as ExpenseClass,
    monthlySpend: observedMonths.map(
      (month) => spendByNameMonth.get(category.name)?.get(month) ?? 0,
    ),
    currentBudgeted: toNumber(category.budgeted),
    wasDefaultClassified: !(category.name in CATEGORY_PRESETS),
  }));
}

function convertEurResponse(response: RunwayResponse, factor: number): RunwayResponse {
  const money = (value: number) => value * factor;
  return {
    ...response,
    burn: {
      ...response.burn,
      lean: money(response.burn.lean),
      current: money(response.burn.current),
      components: response.burn.components.map((component) => ({
        ...component,
        amount: money(component.amount),
      })),
    },
    tiers: response.tiers.map((tier) => ({ ...tier, amount: money(tier.amount) })),
    incomeSupport: response.incomeSupport
      ? {
          ...response.incomeSupport,
          noticeMonthlyNet: money(response.incomeSupport.noticeMonthlyNet),
          severanceNet: money(response.incomeSupport.severanceNet),
          benefit: response.incomeSupport.benefit
            ? {
                ...response.incomeSupport.benefit,
                monthlyNetByMonth: response.incomeSupport.benefit.monthlyNetByMonth.map(money),
              }
            : null,
        }
      : null,
    runway: {
      ...response.runway,
      ledger: response.runway.ledger.map((entry) => ({
        ...entry,
        income: money(entry.income),
        burn: money(entry.burn),
        drawdown: money(entry.drawdown),
        liquidRemaining: money(entry.liquidRemaining),
      })),
    },
    depositGuarantee: response.depositGuarantee.map((entry) => ({
      ...entry,
      total: money(entry.total),
      cap: money(entry.cap),
      excess: money(entry.excess),
    })),
  };
}

function resolveJurisdictionMetadata(
  jurisdiction: ReturnType<typeof getJurisdictionProfile>,
  asOf: string,
): RunwayResponse['jurisdiction'] {
  const resolutions: Array<{ effectiveFrom: string; isExtrapolated: boolean }> = [
    resolveRule(jurisdiction.depositGuarantee, asOf),
    resolveRule(jurisdiction.defaultEffectiveTaxRate, asOf),
  ];
  if (jurisdiction.unemploymentBenefit) {
    resolutions.push(resolveRule(jurisdiction.unemploymentBenefit, asOf));
  }
  if (jurisdiction.severance) resolutions.push(resolveRule(jurisdiction.severance, asOf));
  return {
    code: jurisdiction.code,
    rulesEffectiveFrom: resolutions
      .map((resolution) => resolution.effectiveFrom)
      .sort()
      .at(-1)!,
    isExtrapolated: resolutions.some((resolution) => resolution.isExtrapolated),
  };
}

async function loadRunwayData(userId: number, now: Date) {
  const partnerId = await getAcceptedPartnerId(userId);
  const savingsAccess = ownedOrJointPredicate(savingsAccounts, userId, partnerId);
  const mortgageAccess = ownedOrJointPredicate(mortgages, userId, partnerId);
  const historyStart = toDateMonthsAgo(now, HISTORY_MONTHS);
  const [
    userRows,
    profileRows,
    assumptionRows,
    savings,
    savingsTxns,
    holdingRows,
    holdingTxns,
    mortgageRows,
    debtRows,
    payslipRows,
    categories,
    budgetTxns,
    rates,
  ] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)),
    db.select().from(employmentProfiles).where(eq(employmentProfiles.userId, userId)),
    db.select().from(planAssumptions).where(eq(planAssumptions.userId, userId)),
    db
      .select()
      .from(savingsAccounts)
      .where(and(savingsAccess, isNull(savingsAccounts.archivedAt))),
    db
      .select(getTableColumns(savingsTransactions))
      .from(savingsTransactions)
      .innerJoin(savingsAccounts, eq(savingsTransactions.accountId, savingsAccounts.id))
      .where(and(savingsAccess, gte(savingsTransactions.date, historyStart))),
    db
      .select()
      .from(holdings)
      .where(and(eq(holdings.userId, userId), isNull(holdings.archivedAt))),
    db.select().from(holdingTransactions).where(eq(holdingTransactions.userId, userId)),
    db
      .select()
      .from(mortgages)
      .where(and(mortgageAccess, isNull(mortgages.archivedAt))),
    db
      .select()
      .from(debts)
      .where(and(eq(debts.userId, userId), isNull(debts.archivedAt))),
    db
      .select()
      .from(payslips)
      .where(eq(payslips.userId, userId))
      .orderBy(desc(payslips.date))
      .limit(HISTORY_MONTHS),
    db.select().from(budgetCategories).where(eq(budgetCategories.userId, userId)),
    db
      .select({
        categoryId: budgetTransactions.categoryId,
        amount: budgetTransactions.amount,
        date: budgetTransactions.date,
      })
      .from(budgetTransactions)
      .where(
        and(eq(budgetTransactions.userId, userId), gte(budgetTransactions.date, historyStart)),
      ),
    getCurrentRatesToBaseCurrency(),
  ]);
  return {
    user: userRows[0],
    profile: profileRows[0] ?? null,
    assumptions: assumptionRows[0] ?? null,
    savings,
    savingsTxns,
    holdingRows,
    holdingTxns,
    mortgageRows,
    debtRows,
    payslipRows,
    categories,
    budgetTxns,
    rates,
  };
}

type RunwayData = Awaited<ReturnType<typeof loadRunwayData>>;
type MoneyConverter = (amount: number, currency: string) => number;

function buildLiquidAssets(data: RunwayData, convertToEur: MoneyConverter): LiquidAssetInput[] {
  const assets: LiquidAssetInput[] = data.savings.map((account) => ({
    amount: convertToEur(toNumber(account.balance), account.currency),
    kind: account.accountType === 'Term Deposit' ? 'term_deposit' : 'easy_access',
    isJoint: account.isJoint,
  }));
  assets.push({
    amount: sumHoldingValue(data.holdingRows, data.holdingTxns, convertToEur),
    kind: 'brokerage',
  });
  return assets;
}

function calculateDerivedCashflow(
  data: RunwayData,
  convertToEur: MoneyConverter,
  jointWeight: number,
): number {
  const liquidDelta = data.savingsTxns.reduce((sum, transaction) => {
    const account = data.savings.find((item) => item.id === transaction.accountId);
    const weighted = account?.isJoint ? jointWeight : 1;
    const amount =
      convertToEur(toNumber(transaction.amount), account?.currency ?? 'EUR') * weighted;
    return sum + (transaction.type === 'withdrawal' ? -amount : amount);
  }, 0);
  const netIncome = data.payslipRows.reduce(
    (sum, payslip) => sum + convertToEur(toNumber(payslip.net), payslip.currency),
    0,
  );
  const historyMonths = Math.max(1, Math.min(HISTORY_MONTHS, data.payslipRows.length));
  return Math.max(0, (netIncome - liquidDelta) / historyMonths);
}

function buildContractualInputs(data: RunwayData, convertToEur: MoneyConverter) {
  return [
    ...data.mortgageRows.map((mortgage) => ({
      label: mortgage.propertyAddress || mortgage.lender,
      amount: convertToEur(toNumber(mortgage.monthlyPayment), mortgage.currency),
      source: 'mortgage' as const,
      isJoint: mortgage.isJoint,
    })),
    ...data.debtRows.map((debt) => ({
      label: debt.name,
      amount: convertToEur(toNumber(debt.monthlyPayment), debt.currency),
      source: 'debt' as const,
    })),
  ];
}

function isEmploymentSetupComplete(profile: RunwayData['profile']): boolean {
  return Boolean(
    profile?.employmentType &&
    profile.tenureMonths !== null &&
    profile.noticePeriodMonths !== null &&
    profile.hasDependents !== null,
  );
}

function buildIncomeSupport(
  data: RunwayData,
  jurisdiction: ReturnType<typeof getJurisdictionProfile>,
  asOf: string,
  convertToEur: MoneyConverter,
) {
  return calculateIncomeSupport({
    jurisdiction,
    asOf,
    employmentType: data.profile?.employmentType as EmploymentType | null,
    tenureMonths: data.profile?.tenureMonths ?? null,
    noticePeriodMonths: data.profile?.noticePeriodMonths ?? null,
    payslips: data.payslipRows.map((payslip) => ({
      gross: convertToEur(toNumber(payslip.gross), payslip.currency),
      tax: convertToEur(toNumber(payslip.tax), payslip.currency),
      net: convertToEur(toNumber(payslip.net), payslip.currency),
    })),
    assumptions: data.assumptions,
  });
}

function buildEurRunwayResponse(
  data: RunwayData,
  user: NonNullable<RunwayData['user']>,
  jurisdiction: ReturnType<typeof getJurisdictionProfile>,
  asOf: string,
  convertToEur: MoneyConverter,
): RunwayResponse {
  const jointWeight = data.assumptions?.countFullJointBalances ? 1 : JOINT_WEIGHT;
  const burn = calculateBurn({
    categories: buildBudgetInputs(data.categories, data.budgetTxns),
    contractual: buildContractualInputs(data, convertToEur),
    derivedCashflowMonthly: calculateDerivedCashflow(data, convertToEur, jointWeight),
    assumptions: data.assumptions,
  });
  const incomeSupport = buildIncomeSupport(data, jurisdiction, asOf, convertToEur);
  const tiers = calculateLiquidityTiers(buildLiquidAssets(data, convertToEur), data.assumptions);
  const guaranteeRule = resolveRule(jurisdiction.depositGuarantee, asOf);
  return {
    baseCurrency: user.baseCurrency,
    asOf,
    jurisdiction: resolveJurisdictionMetadata(jurisdiction, asOf),
    burn,
    tiers,
    incomeSupport,
    runway: simulateRunway(burn.lean, tiers, incomeSupport),
    depositGuarantee: aggregateDepositGuarantees(
      data.savings.map((account) => ({
        bank: account.bank,
        amount: convertToEur(toNumber(account.balance), account.currency),
        isJoint: account.isJoint,
      })),
      guaranteeRule.value.amount,
      guaranteeRule.value.scheme,
    ),
    setupComplete: isEmploymentSetupComplete(data.profile),
    isEstimated: false,
  };
}

async function buildRunwayResponse(
  userId: number,
  now = new Date(),
): Promise<RunwayResponse | null> {
  const data = await loadRunwayData(userId, now);
  if (!data.user || !isJurisdictionCode(data.user.jurisdiction)) return null;
  const convertToEur = (amount: number, currency: string) =>
    convertToBaseCurrency(amount, currency, data.rates);
  const jurisdiction = getJurisdictionProfile(data.user.jurisdiction);
  const asOf = now.toISOString().slice(0, ISO_DATE_LENGTH);
  const response = buildEurRunwayResponse(data, data.user, jurisdiction, asOf, convertToEur);
  const baseRate =
    data.user.baseCurrency === FX_BASE_CURRENCY ? 1 : data.rates.get(data.user.baseCurrency);
  return convertEurResponse(response, baseRate ? 1 / baseRate : 1);
}

app.get('/runway', async (c) => {
  const user = getAuthUser(c);
  const data = await buildRunwayResponse(user.id);
  return data ? c.json({ data }) : c.json({ error: 'User not found' }, HTTP_STATUS.NOT_FOUND);
});

app.put('/employment', async (c) => {
  const user = getAuthUser(c);
  const parsed = await parsePatch(
    c.req,
    EMPLOYMENT_FIELDS,
    employmentParsers,
    'Invalid employment profile',
  );
  if (!parsed.ok) return c.json({ error: parsed.error }, HTTP_STATUS.BAD_REQUEST);
  const [data] = await db
    .insert(employmentProfiles)
    .values({ userId: user.id, ...parsed.value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: employmentProfiles.userId,
      set: { ...parsed.value, updatedAt: new Date() },
    })
    .returning();
  return c.json({ data });
});

app.get('/assumptions', async (c) => {
  const user = getAuthUser(c);
  const [data] = await db.select().from(planAssumptions).where(eq(planAssumptions.userId, user.id));
  return c.json({ data: data ?? null });
});

app.put('/assumptions', async (c) => {
  const user = getAuthUser(c);
  const parsed = await parsePatch(
    c.req,
    ASSUMPTION_FIELDS,
    assumptionParsers,
    'Invalid plan assumptions',
  );
  if (!parsed.ok) return c.json({ error: parsed.error }, HTTP_STATUS.BAD_REQUEST);
  const [data] = await db
    .insert(planAssumptions)
    .values({ userId: user.id, ...parsed.value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: planAssumptions.userId,
      set: { ...parsed.value, updatedAt: new Date() },
    })
    .returning();
  return c.json({ data });
});

export { buildRunwayResponse };
export default app;
