import {
  WW_WEEKLY_REQUIREMENT_STATUSES,
  isJurisdictionCode,
  resolveRule,
  toBudgetMonthIndex,
  type BudgetMonth,
  type ExpenseClass,
  type PlanAssumptionsInput,
  type RunwayResponse,
  type WwWeeklyRequirementStatus,
  toIsoDate,
} from '@quro/shared';
import { and, asc, desc, eq, getTableColumns, gte, isNull, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { HTTP_STATUS } from '../constants/http';
import { db } from '../db/client';
import {
  budgetCategories,
  budgetTransactions,
  debts,
  employments,
  holdingTransactions,
  holdings,
  mortgages,
  payslips,
  planAssumptions,
  savingsAccounts,
  savingsTransactions,
  users,
} from '../db/schema';
import { getAuthUser, getPartnerId } from '../lib/authUser';
import { convertToBaseCurrency, FX_BASE_CURRENCY } from '../lib/currencyRateCache';
import { getCurrentRatesToBaseCurrency } from '../lib/currencyRateSync';
import { getJurisdictionProfile } from '../lib/jurisdictions';
import { ownedOrJointPredicate, loadHouseholdRows, householdShare } from '../lib/partner';
import {
  aggregateDepositGuarantees,
  calculateBurn,
  calculateIncomeSupport,
  calculateLiquidityTiers,
  calculateServiceDuration,
  simulateRunway,
  type BudgetCategoryBurnInput,
  type LiquidAssetInput,
} from '../lib/runway';
import {
  err,
  type FieldParsers,
  isRecord,
  ok,
  parseDateString,
  parseOptionalBooleanField,
  parseOptionalIntegerField,
  parseOptionalNumberField,
  parsePatchFields,
  type ParseResult,
  readJsonBody,
  rejectUnknownFields,
} from '../lib/requestValidation';
import { toNumberOrZero } from '../lib/numbers';
import { sumBrokerageValue } from '../lib/netWorth';

const app = new Hono();
const HISTORY_MONTHS = 12;
const MONTHS_PER_YEAR = 12;
const ASSUMPTION_FIELDS = [
  'leanBurnOverride',
  'emergencyLifestylePct',
  'excludedTiers',
  'countFullJointBalances',
  'benefitMonthlyOverride',
  'benefitMaxMonthsOverride',
  'wwWeeklyRequirement',
  'wwDurationMonths',
  'wwDurationConfirmedAt',
  'severanceMonthlySalaryOverride',
] as const;

function toDateMonthsAgo(now: Date, months: number): string {
  return toIsoDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + 1, 1)));
}

function parseExcludedTiers(value: unknown): ParseResult<number[] | null> {
  if (value === null) return ok(null);
  if (!Array.isArray(value)) return err('Excluded tiers must be an array');
  const tiers = value.filter((tier): tier is number => Number.isInteger(tier));
  return tiers.length === value.length && tiers.every((tier) => tier >= 1 && tier <= 3)
    ? ok([...new Set(tiers)])
    : err('Excluded tiers must contain only 1, 2, or 3');
}

type AssumptionFields = Omit<Required<PlanAssumptionsInput>, 'wwWeeklyRequirement'> & {
  wwWeeklyRequirement: WwWeeklyRequirementStatus;
};

const assumptionParsers: FieldParsers<AssumptionFields> = {
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
  wwWeeklyRequirement: (value) =>
    typeof value === 'string' &&
    WW_WEEKLY_REQUIREMENT_STATUSES.includes(value as WwWeeklyRequirementStatus)
      ? ok(value as WwWeeklyRequirementStatus)
      : err('WW weekly requirement must be unknown, met, or not_met'),
  wwDurationMonths: (value) =>
    parseOptionalIntegerField(value, 'WW duration must be 0 to 24 months', 0, 24),
  wwDurationConfirmedAt: (value) => {
    if (value === null) return ok(null);
    const parsed = parseDateString(value);
    return parsed ? ok(parsed) : err('WW confirmation date must be a valid ISO date');
  },
  severanceMonthlySalaryOverride: (value) =>
    parseOptionalNumberField(value, 'Severance salary must be zero or greater', 0),
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
    monthly.set(month, (monthly.get(month) ?? 0) + toNumberOrZero(transaction.amount));
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
    currentBudgeted: toNumberOrZero(category.budgeted),
    wasDefaultClassified: !category.expenseClassConfirmed,
  }));
}

function resolveJurisdictionMetadata(
  jurisdiction: ReturnType<typeof getJurisdictionProfile>,
  asOf: string,
): RunwayResponse['jurisdiction'] {
  const resolutions: Array<{ effectiveFrom: string; isExtrapolated: boolean }> = [
    resolveRule(jurisdiction.defaultEffectiveTaxRate, asOf),
  ];
  if (jurisdiction.unemploymentBenefit) {
    resolutions.push(resolveRule(jurisdiction.unemploymentBenefit, asOf));
  }
  if (jurisdiction.severance) resolutions.push(resolveRule(jurisdiction.severance, asOf));
  return {
    code: jurisdiction.code,
    labels: jurisdiction.labels,
    unemploymentModel: jurisdiction.unemploymentModel,
    rulesEffectiveFrom: resolutions
      .map((resolution) => resolution.effectiveFrom)
      .sort()
      .at(-1)!,
    isExtrapolated: resolutions.some((resolution) => resolution.isExtrapolated),
  };
}

// eslint-disable-next-line max-lines-per-function
async function loadRunwayData(userId: number, partnerId: number | null, now: Date) {
  const savingsAccess = ownedOrJointPredicate(savingsAccounts, userId, partnerId);
  const historyStart = toDateMonthsAgo(now, HISTORY_MONTHS);
  const asOf = toIsoDate(now);
  const [primaryEmployment] = await db
    .select()
    .from(employments)
    .where(
      and(
        eq(employments.userId, userId),
        or(isNull(employments.endDate), gte(employments.endDate, asOf)),
      ),
    )
    .orderBy(desc(employments.isPrimary), asc(employments.id))
    .limit(1);
  const [
    userRows,
    assumptionRows,
    savings,
    savingsTxns,
    holdingRows,
    holdingTxns,
    mortgageRows,
    debtRows,
    payslipRows,
    linkedPayslipRows,
    unlinkedPayslipRows,
    categories,
    budgetTxns,
    rates,
  ] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)),
    db.select().from(planAssumptions).where(eq(planAssumptions.userId, userId)),
    loadHouseholdRows(savingsAccounts, userId, partnerId),
    db
      .select({
        ...getTableColumns(savingsTransactions),
        currency: savingsAccounts.currency,
        isJoint: savingsAccounts.isJoint,
      })
      .from(savingsTransactions)
      .innerJoin(savingsAccounts, eq(savingsTransactions.accountId, savingsAccounts.id))
      .where(and(savingsAccess, gte(savingsTransactions.date, historyStart))),
    db
      .select()
      .from(holdings)
      .where(and(eq(holdings.userId, userId), isNull(holdings.archivedAt))),
    db.select().from(holdingTransactions).where(eq(holdingTransactions.userId, userId)),
    loadHouseholdRows(mortgages, userId, partnerId),
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
    primaryEmployment
      ? db
          .select()
          .from(payslips)
          .where(and(eq(payslips.userId, userId), eq(payslips.employmentId, primaryEmployment.id)))
          .orderBy(desc(payslips.date))
          .limit(HISTORY_MONTHS)
      : Promise.resolve([]),
    db
      .select()
      .from(payslips)
      .where(and(eq(payslips.userId, userId), isNull(payslips.employmentId)))
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
    primaryEmployment: primaryEmployment ?? null,
    assumptions: assumptionRows[0] ?? null,
    savings,
    savingsTxns,
    holdingRows,
    holdingTxns,
    mortgageRows,
    debtRows,
    payslipRows,
    linkedPayslipRows,
    unlinkedPayslipRows,
    categories,
    budgetTxns,
    rates,
  };
}

type RunwayData = Awaited<ReturnType<typeof loadRunwayData>>;
type MoneyConverter = (amount: number, currency: string) => number;

function buildLiquidAssets(data: RunwayData, convertToEur: MoneyConverter): LiquidAssetInput[] {
  const assets: LiquidAssetInput[] = data.savings.map((account) => ({
    amount: convertToEur(toNumberOrZero(account.balance), account.currency),
    kind: account.accountType === 'Term Deposit' ? 'term_deposit' : 'easy_access',
    isJoint: account.isJoint,
  }));
  assets.push({
    amount: sumBrokerageValue(data.holdingRows, data.holdingTxns, convertToEur),
    kind: 'brokerage',
  });
  return assets;
}

function calculateDerivedCashflow(
  data: RunwayData,
  convertToEur: MoneyConverter,
  fullJoint: boolean,
): number {
  const liquidDelta = data.savingsTxns.reduce((sum, transaction) => {
    const weighted = householdShare(transaction.isJoint, fullJoint ? 'full' : 'personal');
    const amount =
      convertToEur(toNumberOrZero(transaction.amount), transaction.currency) * weighted;
    return sum + (transaction.type === 'withdrawal' ? -amount : amount);
  }, 0);
  const netIncome = data.payslipRows.reduce(
    (sum, payslip) => sum + convertToEur(toNumberOrZero(payslip.net), payslip.currency),
    0,
  );
  const historyMonths = Math.max(1, Math.min(HISTORY_MONTHS, data.payslipRows.length));
  return Math.max(0, (netIncome - liquidDelta) / historyMonths);
}

function buildContractualInputs(data: RunwayData, convertToEur: MoneyConverter) {
  return [
    ...data.mortgageRows.map((mortgage) => ({
      label: mortgage.propertyAddress || mortgage.lender,
      amount: convertToEur(toNumberOrZero(mortgage.monthlyPayment), mortgage.currency),
      source: 'mortgage' as const,
      isJoint: mortgage.isJoint,
    })),
    ...data.debtRows.map((debt) => ({
      label: debt.name,
      amount: convertToEur(toNumberOrZero(debt.monthlyPayment), debt.currency),
      source: 'debt' as const,
    })),
  ];
}

function getMissingEmploymentFields(employment: RunwayData['primaryEmployment']): string[] {
  if (!employment) return ['employment'];
  if (employment.employmentType !== 'employed') return [];
  return [
    ...(employment.employerName?.trim() ? [] : ['employerName']),
    ...(employment.serviceStartDate ? [] : ['serviceStartDate']),
    ...(employment.noticePeriodMonths === null ? ['noticePeriodMonths'] : []),
  ];
}

function toEmploymentDto(employment: NonNullable<RunwayData['primaryEmployment']>) {
  return {
    id: employment.id,
    employerName: employment.employerName,
    employmentType: employment.employmentType,
    serviceStartDate: employment.serviceStartDate,
    endDate: employment.endDate,
    noticePeriodMonths: employment.noticePeriodMonths,
    isPrimary: employment.isPrimary,
    createdAt: employment.createdAt.toISOString(),
    updatedAt: employment.updatedAt.toISOString(),
  };
}

// eslint-disable-next-line complexity
function buildIncomeSupport(
  data: RunwayData,
  jurisdiction: ReturnType<typeof getJurisdictionProfile>,
  asOf: string,
  convertToEur: MoneyConverter,
  assumptions: PlanAssumptionsInput | null,
) {
  const selectedPayslips =
    data.linkedPayslipRows.length > 0 ? data.linkedPayslipRows : data.unlinkedPayslipRows;
  return calculateIncomeSupport({
    jurisdiction,
    asOf,
    employmentType: data.primaryEmployment?.employmentType ?? null,
    serviceStartDate: data.primaryEmployment?.serviceStartDate ?? null,
    employmentEndDate: data.primaryEmployment?.endDate ?? null,
    noticePeriodMonths: data.primaryEmployment?.noticePeriodMonths ?? null,
    salaryBasisStatus:
      data.linkedPayslipRows.length > 0
        ? 'linked_payslips'
        : selectedPayslips.length > 0
          ? 'unlinked_fallback'
          : 'missing',
    payslips: selectedPayslips.map((payslip) => ({
      id: payslip.id,
      date: payslip.date,
      gross: convertToEur(toNumberOrZero(payslip.gross), payslip.currency),
      tax: convertToEur(toNumberOrZero(payslip.tax), payslip.currency),
      net: convertToEur(toNumberOrZero(payslip.net), payslip.currency),
      currency: 'EUR',
    })),
    assumptions,
  });
}

function convertAssumptionsToEur(
  assumptions: RunwayData['assumptions'],
  baseCurrency: string,
  convertToEur: MoneyConverter,
): PlanAssumptionsInput | null {
  if (!assumptions) return null;
  const money = (value: number | null) =>
    value === null ? null : convertToEur(value, baseCurrency);
  return {
    ...assumptions,
    leanBurnOverride: money(assumptions.leanBurnOverride),
    benefitMonthlyOverride: money(assumptions.benefitMonthlyOverride),
    severanceMonthlySalaryOverride: money(assumptions.severanceMonthlySalaryOverride),
  };
}

function buildEurRunwayResponse(
  data: RunwayData,
  user: NonNullable<RunwayData['user']>,
  jurisdiction: ReturnType<typeof getJurisdictionProfile>,
  asOf: string,
  convertToEur: MoneyConverter,
): RunwayResponse {
  const assumptions = convertAssumptionsToEur(data.assumptions, user.baseCurrency, convertToEur);
  const fullJoint = assumptions?.countFullJointBalances === true;
  const burn = calculateBurn({
    categories: buildBudgetInputs(data.categories, data.budgetTxns).map((category) => ({
      ...category,
      monthlySpend: category.monthlySpend.map((amount) => convertToEur(amount, user.baseCurrency)),
      currentBudgeted: convertToEur(category.currentBudgeted, user.baseCurrency),
    })),
    contractual: buildContractualInputs(data, convertToEur),
    derivedCashflowMonthly: calculateDerivedCashflow(data, convertToEur, fullJoint),
    assumptions,
  });
  const incomeSupport = buildIncomeSupport(data, jurisdiction, asOf, convertToEur, assumptions);
  const tiers = calculateLiquidityTiers(buildLiquidAssets(data, convertToEur), assumptions);
  const primaryEmployment = data.primaryEmployment ? toEmploymentDto(data.primaryEmployment) : null;
  const service = primaryEmployment?.serviceStartDate
    ? calculateServiceDuration(primaryEmployment.serviceStartDate, asOf)
    : null;
  const missingFields = getMissingEmploymentFields(data.primaryEmployment);
  return {
    baseCurrency: FX_BASE_CURRENCY,
    asOf,
    jurisdiction: resolveJurisdictionMetadata(jurisdiction, asOf),
    employment: {
      primary: primaryEmployment,
      derived: service ? { asOf, ...service } : null,
      missingFields,
    },
    burn,
    tiers,
    incomeSupport,
    runway: simulateRunway(burn.lean, tiers, incomeSupport),
    depositGuarantee: aggregateDepositGuarantees(
      data.savings.map((account) => ({
        id: account.id,
        bank: account.bank,
        amount: toNumberOrZero(account.balance),
        currency: account.currency,
        isJoint: account.isJoint,
        confirmedEntity: account.bankingEntityConfirmedAt
          ? {
              entityId: account.bankingEntityId,
              entityName: account.bankingEntityName,
              scheme: account.depositGuaranteeScheme,
              cap:
                account.depositGuaranteeCap != null
                  ? toNumberOrZero(account.depositGuaranteeCap)
                  : null,
              currency: account.depositGuaranteeCurrency,
            }
          : null,
      })),
      convertToEur,
    ),
    setupComplete: missingFields.length === 0,
    isEstimated:
      incomeSupport.salaryBasis.status === 'unlinked_fallback' ||
      incomeSupport.unemployment.status === 'unknown',
  };
}

async function buildRunwayResponse(
  userId: number,
  partnerId: number | null,
  now = new Date(),
): Promise<RunwayResponse | null> {
  const data = await loadRunwayData(userId, partnerId, now);
  if (!data.user || !isJurisdictionCode(data.user.jurisdiction)) return null;
  const convertToEur = (amount: number, currency: string) =>
    convertToBaseCurrency(amount, currency, data.rates);
  const jurisdiction = getJurisdictionProfile(data.user.jurisdiction);
  const asOf = toIsoDate(now);
  return buildEurRunwayResponse(data, data.user, jurisdiction, asOf, convertToEur);
}

app.get('/runway', async (c) => {
  const user = getAuthUser(c);
  const data = await buildRunwayResponse(user.id, getPartnerId(c));
  return data ? c.json({ data }) : c.json({ error: 'User not found' }, HTTP_STATUS.NOT_FOUND);
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
