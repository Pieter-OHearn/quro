import {
  resolveRule,
  type ExpenseClass,
  type JurisdictionProfile,
  type PlanAssumptionsInput,
  type RunwayBand,
  type RunwayBurnSource,
  type SeveranceRule,
  type UnemploymentEligibility,
  type UnemploymentRule,
} from '@quro/shared';
import { resolveBankingEntity } from './jurisdictions/bankingEntities';

const JOINT_WEIGHT = 0.5;
const MONTHS_PER_YEAR = 12;
const WW_MINIMUM_TENURE_MONTHS = 6;
const TIER_TWO_HAIRCUT = 0.02;
const TIER_THREE_HAIRCUT = 0.15;
const MAX_LEDGER_MONTHS = 1_200;

export type BudgetCategoryBurnInput = {
  label: string;
  expenseClass: ExpenseClass;
  monthlySpend: number[];
  currentBudgeted: number;
  wasDefaultClassified?: boolean;
};

export type ContractualBurnInput = {
  label: string;
  amount: number;
  source: 'mortgage' | 'debt';
  isJoint?: boolean;
};

export type BurnCalculationInput = {
  categories: BudgetCategoryBurnInput[];
  contractual: ContractualBurnInput[];
  derivedCashflowMonthly: number;
  assumptions?: PlanAssumptionsInput | null;
};

export type BurnCalculation = {
  lean: number;
  current: number;
  burnSource: RunwayBurnSource;
  isPartialHistory: boolean;
  unclassifiedCategoryCount: number;
  components: Array<{
    label: string;
    amount: number;
    source: 'budget_category' | 'mortgage' | 'debt';
    expenseClass: ExpenseClass;
  }>;
};

export type LiquidAssetInput = {
  amount: number;
  kind: 'easy_access' | 'term_deposit' | 'brokerage';
  isJoint?: boolean;
};

export type LiquidityTier = {
  tier: number;
  label: string;
  amount: number;
  haircutPct: number;
  note: string;
  included: boolean;
};

export type PayslipInput = { gross: number; tax: number; net: number };

export type IncomeSupportInput = {
  jurisdiction: JurisdictionProfile;
  asOf: string;
  employmentType: 'employed' | 'self_employed' | 'other' | null;
  tenureMonths: number | null;
  noticePeriodMonths: number | null;
  payslips: PayslipInput[];
  assumptions?: PlanAssumptionsInput | null;
};

export type IncomeSupport = {
  noticeMonths: number;
  noticeMonthlyNet: number;
  severanceNet: number;
  benefit: { monthlyNetByMonth: number[]; maxMonths: number } | null;
  effectiveTaxRate: number;
  taxRateSource: 'payslips' | 'jurisdiction_default';
  eligibility: UnemploymentEligibility;
};

export type SavingsGuaranteeInput = {
  bank: string;
  amount: number;
  isJoint: boolean;
};

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + Math.max(0, value), 0) / values.length;
}

function getHistoryMonths(categories: readonly BudgetCategoryBurnInput[]): number {
  return categories.reduce(
    (maximum, category) => Math.max(maximum, category.monthlySpend.length),
    0,
  );
}

function resolveBurnSource(historyMonths: number): {
  burnSource: RunwayBurnSource;
  isPartialHistory: boolean;
} {
  if (historyMonths >= MONTHS_PER_YEAR) return { burnSource: 'envelopes', isPartialHistory: false };
  if (historyMonths >= 2) return { burnSource: 'envelopes_partial', isPartialHistory: true };
  return { burnSource: 'derived_cashflow', isPartialHistory: true };
}

function buildBudgetComponents(
  categories: readonly BudgetCategoryBurnInput[],
): BurnCalculation['components'] {
  return categories.map((category) => ({
    label: category.label,
    amount:
      category.monthlySpend.length >= 2
        ? average(category.monthlySpend)
        : Math.max(0, category.currentBudgeted),
    source: 'budget_category',
    expenseClass: category.expenseClass,
  }));
}

function buildContractualComponents(
  contractual: readonly ContractualBurnInput[],
): BurnCalculation['components'] {
  return contractual.map((component) => ({
    label: component.label,
    amount: Math.max(0, component.amount) * (component.isJoint ? JOINT_WEIGHT : 1),
    source: component.source,
    expenseClass: 'essential',
  }));
}

export function calculateBurn(input: BurnCalculationInput): BurnCalculation {
  const source = resolveBurnSource(getHistoryMonths(input.categories));
  const contractualComponents = buildContractualComponents(input.contractual);
  const contractualTotal = contractualComponents.reduce(
    (sum, component) => sum + component.amount,
    0,
  );
  const lifestylePct = input.assumptions?.emergencyLifestylePct ?? 1;

  if (source.burnSource === 'derived_cashflow') {
    const derived = Math.max(contractualTotal, input.derivedCashflowMonthly);
    const lean = input.assumptions?.leanBurnOverride ?? derived;
    return {
      lean,
      current: derived,
      ...source,
      unclassifiedCategoryCount: input.categories.filter(
        (category) => category.wasDefaultClassified,
      ).length,
      components: contractualComponents,
    };
  }

  const budgetComponents = buildBudgetComponents(input.categories);
  const current =
    budgetComponents.reduce((sum, component) => sum + component.amount, 0) + contractualTotal;
  const derivedLean =
    budgetComponents
      .filter((component) => component.expenseClass === 'essential')
      .reduce((sum, component) => sum + component.amount * lifestylePct, 0) + contractualTotal;

  return {
    lean: input.assumptions?.leanBurnOverride ?? derivedLean,
    current,
    ...source,
    unclassifiedCategoryCount: input.categories.filter((category) => category.wasDefaultClassified)
      .length,
    components: [...budgetComponents, ...contractualComponents],
  };
}

function tierDefinition(
  kind: LiquidAssetInput['kind'],
): Omit<LiquidityTier, 'amount' | 'included'> {
  if (kind === 'easy_access') {
    return {
      tier: 1,
      label: 'Cash',
      haircutPct: 0,
      note: 'Available without a market-value haircut',
    };
  }
  if (kind === 'term_deposit') {
    return {
      tier: 2,
      label: 'Term deposits',
      haircutPct: TIER_TWO_HAIRCUT,
      note: 'Allows for early-access costs',
    };
  }
  return {
    tier: 3,
    label: 'Brokerage',
    haircutPct: TIER_THREE_HAIRCUT,
    note: 'Allows for market volatility and sale costs',
  };
}

export function calculateLiquidityTiers(
  assets: readonly LiquidAssetInput[],
  assumptions?: PlanAssumptionsInput | null,
): LiquidityTier[] {
  const fullJoint = assumptions?.countFullJointBalances === true;
  const excluded = new Set(assumptions?.excludedTiers ?? []);
  return (['easy_access', 'term_deposit', 'brokerage'] as const).map((kind) => {
    const definition = tierDefinition(kind);
    const amount = assets
      .filter((asset) => asset.kind === kind)
      .reduce(
        (sum, asset) =>
          sum + Math.max(0, asset.amount) * (asset.isJoint && !fullJoint ? JOINT_WEIGHT : 1),
        0,
      );
    return { ...definition, amount, included: !excluded.has(definition.tier) };
  });
}

function getEffectiveTaxRate(
  payslips: readonly PayslipInput[],
  jurisdiction: JurisdictionProfile,
  asOf: string,
): { rate: number; source: IncomeSupport['taxRateSource'] } {
  const gross = payslips.reduce((sum, payslip) => sum + Math.max(0, payslip.gross), 0);
  if (gross > 0) {
    const tax = payslips.reduce((sum, payslip) => sum + Math.max(0, payslip.tax), 0);
    return { rate: Math.min(1, tax / gross), source: 'payslips' };
  }
  return {
    rate: resolveRule(jurisdiction.defaultEffectiveTaxRate, asOf).value,
    source: 'jurisdiction_default',
  };
}

function getEligibility(
  employmentType: IncomeSupportInput['employmentType'],
  tenureMonths: number | null,
): UnemploymentEligibility {
  if (employmentType !== 'employed') {
    return { eligible: false, confidence: 'derived', unverifiedConditions: [] };
  }
  if (tenureMonths !== null && tenureMonths < WW_MINIMUM_TENURE_MONTHS) {
    return {
      eligible: false,
      confidence: 'derived',
      unverifiedConditions: ['other employment in the last 36 weeks'],
    };
  }
  return {
    eligible: true,
    confidence: 'assumed',
    unverifiedConditions: [
      'worked in at least 26 of the last 36 weeks',
      'lost at least five working hours per week',
      'available for paid work',
      'not dismissed for cause',
    ],
  };
}

function calculateBenefitDuration(tenureMonths: number, rule: UnemploymentRule): number {
  const serviceYears = Math.max(0, tenureMonths) / MONTHS_PER_YEAR;
  const initialYears = Math.min(rule.fullMonthPerYearYears, serviceYears);
  const laterYears = Math.max(0, serviceYears - rule.fullMonthPerYearYears);
  const calculated = initialYears + laterYears * rule.monthsPerYearAfterThreshold;
  return Math.min(
    rule.maximumDurationMonths,
    Math.max(rule.minimumDurationMonths, Math.floor(calculated)),
  );
}

function averagePayslip(payslips: readonly PayslipInput[], field: keyof PayslipInput): number {
  return average(payslips.map((payslip) => payslip[field]));
}

function buildBenefitSchedule(params: {
  input: IncomeSupportInput;
  rule: UnemploymentRule;
  tenureMonths: number;
  monthlyGross: number;
  taxRate: number;
}): { monthlyNetByMonth: number[]; maxMonths: number } {
  const maxMonths =
    params.input.assumptions?.benefitMaxMonthsOverride ??
    calculateBenefitDuration(params.tenureMonths, params.rule);
  const maximumMonthlyWage =
    (params.rule.maximumDailyWage * params.rule.workingDaysPerYear) / MONTHS_PER_YEAR;
  const cappedGross = Math.min(params.monthlyGross, maximumMonthlyWage);
  const override = params.input.assumptions?.benefitMonthlyOverride;
  const monthlyNetByMonth = Array.from({ length: maxMonths }, (_, index) => {
    const rate =
      index < params.rule.initialRateMonths ? params.rule.initialRate : params.rule.ongoingRate;
    return override ?? cappedGross * rate * (1 - params.taxRate);
  });
  return { monthlyNetByMonth, maxMonths };
}

function calculateSeveranceNet(
  monthlyGross: number,
  tenureMonths: number,
  taxRate: number,
  rule: SeveranceRule,
): number {
  const serviceYears = tenureMonths / MONTHS_PER_YEAR;
  const annualGross = monthlyGross * MONTHS_PER_YEAR;
  const cap = rule.annualSalaryIfHigher
    ? Math.max(rule.maximumAmount, annualGross)
    : rule.maximumAmount;
  const gross = Math.min(
    cap,
    monthlyGross * rule.monthlySalaryFractionPerServiceYear * serviceYears,
  );
  return gross * (1 - taxRate);
}

export function calculateIncomeSupport(input: IncomeSupportInput): IncomeSupport | null {
  const eligibility = getEligibility(input.employmentType, input.tenureMonths);
  if (
    !eligibility.eligible ||
    !input.jurisdiction.unemploymentBenefit ||
    !input.jurisdiction.severance
  )
    return null;

  const benefitRule = resolveRule(input.jurisdiction.unemploymentBenefit, input.asOf).value;
  const severanceRule = resolveRule(input.jurisdiction.severance, input.asOf).value;
  const tax = getEffectiveTaxRate(input.payslips, input.jurisdiction, input.asOf);
  const monthlyGross = averagePayslip(input.payslips, 'gross');
  const monthlyNet = averagePayslip(input.payslips, 'net') || monthlyGross * (1 - tax.rate);
  const tenureMonths = input.tenureMonths ?? 0;
  const benefit = buildBenefitSchedule({
    input,
    rule: benefitRule,
    tenureMonths,
    monthlyGross,
    taxRate: tax.rate,
  });

  return {
    noticeMonths: input.noticePeriodMonths ?? 0,
    noticeMonthlyNet: monthlyNet,
    severanceNet: calculateSeveranceNet(monthlyGross, tenureMonths, tax.rate, severanceRule),
    benefit,
    effectiveTaxRate: tax.rate,
    taxRateSource: tax.source,
    eligibility,
  };
}

function effectiveTierAmount(tier: LiquidityTier): number {
  return tier.included ? tier.amount * (1 - tier.haircutPct) : 0;
}

function classifyBand(months: number | null): RunwayBand {
  if (months === null || months >= 6) return 'resilient';
  if (months >= 1) return 'building';
  return 'critical';
}

function buildIncomeByMonth(support: IncomeSupport | null): number[] {
  if (!support) return [];
  return [
    ...Array.from({ length: support.noticeMonths }, () => support.noticeMonthlyNet),
    ...(support.benefit?.monthlyNetByMonth ?? []),
  ];
}

type RunwayLedgerEntry = {
  month: number;
  income: number;
  burn: number;
  drawdown: number;
  liquidRemaining: number;
};

function getRunwayBalances(
  burn: number,
  tiers: readonly LiquidityTier[],
  severance: number,
): { cashMonths: number; liquidMonths: number; initialLiquid: number } {
  const cashTier = tiers.find((tier) => tier.tier === 1);
  const cash = cashTier ? effectiveTierAmount(cashTier) : 0;
  const initialLiquid = tiers.reduce((sum, tier) => sum + effectiveTierAmount(tier), 0) + severance;
  return {
    cashMonths: (cash + severance) / burn,
    liquidMonths: initialLiquid / burn,
    initialLiquid,
  };
}

function simulateLedger(
  burn: number,
  initialLiquid: number,
  incomeByMonth: readonly number[],
): { months: number; ledger: RunwayLedgerEntry[] } {
  const ledger: RunwayLedgerEntry[] = [];
  let months = 0;
  let liquid = initialLiquid;
  let depleted = false;
  for (let month = 0; month < MAX_LEDGER_MONTHS; month += 1) {
    const income = incomeByMonth[month] ?? 0;
    const shortfall = Math.max(0, burn - income);
    const surplus = Math.max(0, income - burn);
    if (shortfall > liquid) {
      months += liquid / shortfall;
      ledger.push({ month, income, burn, drawdown: liquid, liquidRemaining: 0 });
      liquid = 0;
      depleted = true;
      break;
    }
    liquid = liquid - shortfall + surplus;
    months += 1;
    ledger.push({ month, income, burn, drawdown: shortfall, liquidRemaining: liquid });
  }
  if (!depleted && liquid > 0) months += liquid / burn;
  return { months, ledger };
}

export function simulateRunway(
  leanBurn: number,
  tiers: readonly LiquidityTier[],
  support: IncomeSupport | null,
): {
  monthsCashOnly: number;
  monthsAllLiquid: number;
  monthsWithIncomeSupport: number | null;
  band: RunwayBand;
  ledger: RunwayLedgerEntry[];
} {
  const burn = Math.max(0, leanBurn);
  const severance = support?.severanceNet ?? 0;
  if (burn === 0) {
    return {
      monthsCashOnly: 0,
      monthsAllLiquid: 0,
      monthsWithIncomeSupport: null,
      band: 'resilient',
      ledger: [],
    };
  }
  const balances = getRunwayBalances(burn, tiers, severance);
  const simulation = simulateLedger(burn, balances.initialLiquid, buildIncomeByMonth(support));

  return {
    monthsCashOnly: balances.cashMonths,
    monthsAllLiquid: balances.liquidMonths,
    monthsWithIncomeSupport: simulation.months,
    band: classifyBand(simulation.months),
    ledger: simulation.ledger,
  };
}

export function aggregateDepositGuarantees(
  accounts: readonly SavingsGuaranteeInput[],
  cap: number,
  scheme: string,
): Array<{
  entityId: string | null;
  entityName: string;
  scheme: string;
  total: number;
  cap: number;
  excess: number;
  confidence: 'verified' | 'unverified';
}> {
  const groups = new Map<string, ReturnType<typeof resolveBankingEntity> & { total: number }>();
  for (const account of accounts) {
    const entity = resolveBankingEntity(account.bank);
    const key = entity.entityId ?? `unverified:${entity.entityName.toLowerCase()}`;
    const group = groups.get(key) ?? { ...entity, total: 0 };
    // Deposit protection is per depositor, so joint accounts count in full here despite 50% display weighting.
    group.total += Math.max(0, account.amount);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    scheme: group.confidence === 'verified' ? group.scheme : scheme,
    cap,
    excess: Math.max(0, group.total - cap),
  }));
}
