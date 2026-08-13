import {
  resolveRule,
  type CalculationRuleSource,
  type CurrencyCode,
  type ExpenseClass,
  type IncomeSupportCalculation,
  type PlanningJurisdictionProfile,
  type PlanAssumptionsInput,
  type RunwayBand,
  type RunwayBurnSource,
  type SeveranceRule,
  type UnemploymentRule,
} from '@quro/shared';
import { resolveBankingEntity } from './jurisdictions/bankingEntities';

const JOINT_WEIGHT = 0.5;
const MONTHS_PER_YEAR = 12;
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

export type PayslipInput = {
  id: number;
  date: string;
  gross: number;
  tax: number;
  net: number;
  currency: CurrencyCode;
};

export type IncomeSupportInput = {
  jurisdiction: PlanningJurisdictionProfile;
  asOf: string;
  employmentType: 'employed' | 'self_employed' | 'other' | null;
  serviceStartDate: string | null;
  employmentEndDate: string | null;
  noticePeriodMonths: number | null;
  payslips: PayslipInput[];
  salaryBasisStatus: IncomeSupportCalculation['salaryBasis']['status'];
  assumptions?: PlanAssumptionsInput | null;
};

export type SavingsGuaranteeInput = {
  id?: number;
  bank: string;
  amount: number;
  currency: CurrencyCode;
  isJoint: boolean;
  confirmedEntity?: {
    entityId: string | null;
    entityName: string | null;
    scheme: string | null;
    cap: number | null;
    currency: CurrencyCode | null;
  } | null;
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
  jurisdiction: PlanningJurisdictionProfile,
  asOf: string,
): { rate: number; source: IncomeSupportCalculation['taxRateSource'] } {
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

const DATE_MS = 86_400_000;

function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value
    ? null
    : parsed;
}

export function calculateServiceDuration(
  startDate: string,
  asOf: string,
): {
  completedMonths: number;
  serviceDays: number;
  serviceYears: number;
} | null {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(asOf);
  if (!start || !end || start > end) return null;
  const serviceDays = Math.max(0, Math.floor((end.getTime() - start.getTime()) / DATE_MS));
  let completedMonths =
    (end.getUTCFullYear() - start.getUTCFullYear()) * MONTHS_PER_YEAR +
    end.getUTCMonth() -
    start.getUTCMonth();
  if (end.getUTCDate() < start.getUTCDate()) completedMonths -= 1;
  return {
    completedMonths: Math.max(0, completedMonths),
    serviceDays,
    serviceYears: serviceDays / 365.2425,
  };
}

function sourceFromResolution<T>(resolution: {
  value: T;
  effectiveFrom: string;
  effectiveTo: string | null;
  isExtrapolated: boolean;
  source: { id: string; title: string; publisher: string; url: string; reviewedAt: string } | null;
}): CalculationRuleSource | null {
  return resolution.source
    ? {
        ...resolution.source,
        effectiveFrom: resolution.effectiveFrom,
        effectiveTo: resolution.effectiveTo,
        isExtrapolated: resolution.isExtrapolated,
      }
    : null;
}

function emptySalaryBasis(
  status: IncomeSupportCalculation['salaryBasis']['status'],
): IncomeSupportCalculation['salaryBasis'] {
  return {
    status,
    payslipId: null,
    payslipDate: null,
    monthlyGross: 0,
    monthlyNet: 0,
    currency: 'EUR',
    note: 'Add or link a payslip to calculate salary-based support.',
  };
}

function buildSalaryBasis(input: IncomeSupportInput, taxRate: number) {
  const latest = input.payslips[0];
  if (!latest) return emptySalaryBasis('missing');
  return {
    status: input.salaryBasisStatus,
    payslipId: latest.id,
    payslipDate: latest.date,
    monthlyGross: latest.gross,
    monthlyNet: latest.net || latest.gross * (1 - taxRate),
    currency: latest.currency,
    note:
      input.salaryBasisStatus === 'linked_payslips'
        ? 'Using the latest payslip linked to this employment.'
        : 'Using your latest unlinked payslip as a fallback. Link it in Salary for greater confidence.',
  } satisfies IncomeSupportCalculation['salaryBasis'];
}

function buildBenefitSchedule(params: {
  input: IncomeSupportInput;
  rule: UnemploymentRule;
  monthlyGross: number;
  taxRate: number;
}): { monthlyNetByMonth: number[]; maxMonths: number } {
  const maxMonths =
    params.input.assumptions?.benefitMaxMonthsOverride ??
    params.input.assumptions?.wwDurationMonths ??
    params.rule.minimumDurationMonths;
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

function calculateSeverance(
  monthlyGross: number,
  service: NonNullable<ReturnType<typeof calculateServiceDuration>>,
  taxRate: number,
  rule: SeveranceRule,
): { gross: number; net: number; cap: number | null } {
  if (rule.model === 'service_weeks') {
    const completedYears = Math.min(
      Math.floor(service.completedMonths / MONTHS_PER_YEAR),
      rule.weeksByCompletedServiceYear.length - 1,
    );
    const weeks = rule.weeksByCompletedServiceYear[completedYears] ?? 0;
    const weeklyGross = (monthlyGross * MONTHS_PER_YEAR) / rule.weeksPerYear;
    const gross = weeklyGross * weeks;
    return { gross, net: gross * (1 - taxRate), cap: null };
  }
  const annualGross = monthlyGross * MONTHS_PER_YEAR;
  const cap = rule.annualSalaryIfHigher
    ? Math.max(rule.maximumAmount, annualGross)
    : rule.maximumAmount;
  const gross = Math.min(
    cap,
    monthlyGross * rule.monthlySalaryFractionPerServiceYear * service.serviceYears,
  );
  return { gross, net: gross * (1 - taxRate), cap };
}

// The component branches intentionally mirror the user-visible calculation review.
// eslint-disable-next-line complexity, sonarjs/cognitive-complexity, max-lines-per-function
export function calculateIncomeSupport(input: IncomeSupportInput): IncomeSupportCalculation {
  const tax = getEffectiveTaxRate(input.payslips, input.jurisdiction, input.asOf);
  const salaryBasis = buildSalaryBasis(input, tax.rate);
  const severanceMonthlyGross =
    input.assumptions?.severanceMonthlySalaryOverride ?? salaryBasis.monthlyGross;
  const latestPayslip = input.payslips[0];
  const monthlyGrossForBenefits = latestPayslip?.gross ?? 0;
  const monthlyNetForNotice = latestPayslip?.net || monthlyGrossForBenefits * (1 - tax.rate);
  const employed = input.employmentType === 'employed';
  const serviceAsOf =
    input.employmentEndDate && input.employmentEndDate < input.asOf
      ? input.employmentEndDate
      : input.asOf;
  const service = input.serviceStartDate
    ? calculateServiceDuration(input.serviceStartDate, serviceAsOf)
    : null;
  const sources: CalculationRuleSource[] = [];
  if (input.jurisdiction.code === 'NL' && input.jurisdiction.unemploymentBenefit) {
    const wwResolution = resolveRule(input.jurisdiction.unemploymentBenefit, input.asOf);
    const common = {
      publisher: 'UWV',
      reviewedAt: '2026-08-05',
      effectiveFrom: wwResolution.effectiveFrom,
      effectiveTo: wwResolution.effectiveTo,
      isExtrapolated: wwResolution.isExtrapolated,
    };
    sources.push(
      {
        ...common,
        id: 'uwv-ww-eligibility',
        title: 'When am I entitled to WW benefit?',
        url: 'https://www.uwv.nl/nl/ww/wanneer-recht-op-ww',
      },
      {
        ...common,
        id: 'uwv-ww-duration',
        title: 'How long will I receive WW benefit?',
        url: 'https://www.uwv.nl/nl/ww/hoelang-ww',
      },
      {
        ...common,
        id: 'uwv-maximum-daily-wage',
        title: 'Maximum daily wage',
        url: 'https://www.uwv.nl/nl/premies-bedragen/maximum-dagloon',
      },
      {
        ...common,
        id: 'uwv-daily-wage-calculation',
        title: 'Calculating daily wage',
        url: 'https://www.uwv.nl/nl/premies-bedragen/dagloon-berekenen',
      },
    );
  }
  if (input.jurisdiction.unemploymentBenefit) {
    const source = sourceFromResolution(
      resolveRule(input.jurisdiction.unemploymentBenefit, input.asOf),
    );
    if (source) sources.push(source);
  }
  if (input.jurisdiction.code === 'AU') {
    const common = {
      publisher: 'Services Australia',
      reviewedAt: '2026-08-11',
      effectiveFrom: input.asOf,
      effectiveTo: null,
      isExtrapolated: false,
    };
    sources.push(
      {
        ...common,
        id: 'services-australia-jobseeker-eligibility',
        title: 'Who can get JobSeeker Payment',
        url: 'https://www.servicesaustralia.gov.au/who-can-get-jobseeker-payment?context=51411',
      },
      {
        ...common,
        id: 'services-australia-jobseeker-means-tests',
        title: 'Income and assets tests for JobSeeker Payment',
        url: 'https://www.servicesaustralia.gov.au/income-and-assets-tests-for-jobseeker-payment?context=51411',
      },
    );
  }
  if (input.jurisdiction.severance) {
    const source = sourceFromResolution(resolveRule(input.jurisdiction.severance, input.asOf));
    if (source) sources.push(source);
  }
  const warnings = [
    'Net amounts use the effective tax rate from your payslips and are planning estimates, not tax advice.',
  ];
  if (input.jurisdiction.code === 'NL') {
    warnings.push(
      'Dutch transition-pay salary can include holiday allowance and fixed pay components; use the salary override if the payslip gross does not include them.',
    );
  } else if (input.jurisdiction.code === 'AU') {
    warnings.push(
      'Australian redundancy pay uses base pay for ordinary hours and can be unavailable or reduced under Fair Work exceptions.',
      'JobSeeker is household means- and assets-tested, so it is excluded until you enter an estimate and planning duration.',
    );
  }

  const notice: IncomeSupportCalculation['notice'] = !employed
    ? {
        status: 'not_applicable',
        months: null,
        monthlyNet: 0,
        totalNet: 0,
        reason: 'Notice pay is only modelled for employees.',
      }
    : input.noticePeriodMonths === null
      ? {
          status: 'unknown',
          months: null,
          monthlyNet: 0,
          totalNet: 0,
          reason: 'Add your contractual notice period.',
        }
      : !latestPayslip
        ? {
            status: 'unknown',
            months: input.noticePeriodMonths,
            monthlyNet: 0,
            totalNet: 0,
            reason: 'Add or link a payslip to estimate notice pay.',
          }
        : {
            status: 'included',
            months: input.noticePeriodMonths,
            monthlyNet: monthlyNetForNotice,
            totalNet: input.noticePeriodMonths * monthlyNetForNotice,
            reason: 'Contractual notice months multiplied by latest monthly net pay.',
          };

  let severance: IncomeSupportCalculation['severance'];
  if (!employed || !input.jurisdiction.severance) {
    severance = {
      status: 'not_applicable',
      serviceStartDate: input.serviceStartDate,
      serviceDays: service?.serviceDays ?? null,
      serviceYears: service?.serviceYears ?? null,
      monthlyGross: severanceMonthlyGross,
      gross: 0,
      net: 0,
      cap: null,
      reason: employed
        ? 'No severance rule is available for this jurisdiction.'
        : 'Only modelled for employees.',
    };
  } else if (!service || severanceMonthlyGross <= 0) {
    severance = {
      status: 'unknown',
      serviceStartDate: input.serviceStartDate,
      serviceDays: service?.serviceDays ?? null,
      serviceYears: service?.serviceYears ?? null,
      monthlyGross: severanceMonthlyGross,
      gross: 0,
      net: 0,
      cap: null,
      reason: !service ? 'Add a valid continuous-service start date.' : 'Add a salary source.',
    };
  } else {
    const resolution = resolveRule(input.jurisdiction.severance, input.asOf);
    const amount = calculateSeverance(severanceMonthlyGross, service, tax.rate, resolution.value);
    const reason =
      resolution.value.model === 'service_weeks'
        ? 'Fair Work redundancy weeks for completed continuous service, multiplied by estimated weekly base pay.'
        : 'One third of monthly salary per exact year of service, subject to the statutory cap.';
    severance = {
      status: 'included',
      serviceStartDate: input.serviceStartDate,
      serviceDays: service.serviceDays,
      serviceYears: service.serviceYears,
      monthlyGross: severanceMonthlyGross,
      ...amount,
      reason,
    };
  }

  let unemployment: IncomeSupportCalculation['unemployment'];
  const weeklyRequirement = input.assumptions?.wwWeeklyRequirement ?? 'unknown';
  const benefitOverride = input.assumptions?.benefitMonthlyOverride;
  const benefitDurationOverride = input.assumptions?.benefitMaxMonthsOverride;
  const hasAustralianBenefitOverride =
    input.jurisdiction.code === 'AU' &&
    benefitOverride !== null &&
    benefitOverride !== undefined &&
    benefitDurationOverride !== null &&
    benefitDurationOverride !== undefined;
  if (!employed) {
    unemployment = {
      status: 'not_applicable',
      weeklyRequirement,
      durationMonths: null,
      durationConfirmedAt: null,
      durationSource: 'unknown',
      monthlyNetByMonth: [],
      unverifiedConditions: [],
      reason: 'Unemployment support is only modelled for employees.',
    };
  } else if (hasAustralianBenefitOverride) {
    unemployment = {
      status: 'included',
      weeklyRequirement: 'unknown',
      durationMonths: benefitDurationOverride,
      durationConfirmedAt: null,
      durationSource: 'override',
      monthlyNetByMonth: Array.from({ length: benefitDurationOverride }, () => benefitOverride),
      unverifiedConditions: [
        'age and Australian residence rules',
        'household income test',
        'household assets test',
        'mutual-obligation or temporary incapacity requirements',
      ],
      reason:
        'Uses your JobSeeker estimate and planning duration; Services Australia determines actual eligibility and payment.',
    };
  } else if (input.jurisdiction.code === 'AU') {
    unemployment = {
      status: 'unknown',
      weeklyRequirement: 'unknown',
      durationMonths: null,
      durationConfirmedAt: null,
      durationSource: 'unknown',
      monthlyNetByMonth: [],
      unverifiedConditions: [
        'age and Australian residence rules',
        'household income test',
        'household assets test',
        'unemployed, looking for work, or temporarily unable to work',
      ],
      reason:
        'JobSeeker is not derived from salary. Enter the monthly estimate from Services Australia and a planning duration to include it.',
    };
  } else if (!input.jurisdiction.unemploymentBenefit) {
    unemployment = {
      status: 'not_applicable',
      weeklyRequirement,
      durationMonths: null,
      durationConfirmedAt: null,
      durationSource: 'unknown',
      monthlyNetByMonth: [],
      unverifiedConditions: [],
      reason: 'No unemployment rule is available for this jurisdiction.',
    };
  } else if (weeklyRequirement === 'unknown') {
    unemployment = {
      status: 'unknown',
      weeklyRequirement,
      durationMonths: null,
      durationConfirmedAt: null,
      durationSource: 'unknown',
      monthlyNetByMonth: [],
      unverifiedConditions: [
        'worked in at least 26 of the last 36 weeks',
        'lost at least five working hours per week',
        'available for paid work',
        'not dismissed for cause',
      ],
      reason: 'Confirm the UWV 26-of-36-weeks condition before WW is included.',
    };
  } else if (weeklyRequirement === 'not_met') {
    unemployment = {
      status: 'excluded',
      weeklyRequirement,
      durationMonths: 0,
      durationConfirmedAt: null,
      durationSource: 'unknown',
      monthlyNetByMonth: [],
      unverifiedConditions: [],
      reason: 'Excluded because you indicated the 26-of-36-weeks condition is not met.',
    };
  } else if (!latestPayslip) {
    unemployment = {
      status: 'unknown',
      weeklyRequirement,
      durationMonths: null,
      durationConfirmedAt: null,
      durationSource: 'unknown',
      monthlyNetByMonth: [],
      unverifiedConditions: [
        'lost at least five working hours per week',
        'available for paid work',
        'not dismissed for cause',
      ],
      reason: 'Add or link a payslip to estimate WW.',
    };
  } else {
    const resolution = resolveRule(input.jurisdiction.unemploymentBenefit, input.asOf);
    const benefit = buildBenefitSchedule({
      input,
      rule: resolution.value,
      monthlyGross: monthlyGrossForBenefits,
      taxRate: tax.rate,
    });
    const durationSource =
      input.assumptions?.benefitMaxMonthsOverride !== null &&
      input.assumptions?.benefitMaxMonthsOverride !== undefined
        ? 'override'
        : input.assumptions?.wwDurationMonths !== null &&
            input.assumptions?.wwDurationMonths !== undefined
          ? 'confirmed'
          : 'minimum';
    unemployment = {
      status: 'included',
      weeklyRequirement,
      durationMonths: benefit.maxMonths,
      durationConfirmedAt:
        durationSource === 'confirmed' ? (input.assumptions?.wwDurationConfirmedAt ?? null) : null,
      durationSource,
      monthlyNetByMonth: benefit.monthlyNetByMonth,
      unverifiedConditions: [
        'lost at least five working hours per week',
        'available for paid work',
        'not dismissed for cause',
      ],
      reason:
        durationSource === 'minimum'
          ? `Uses ${resolution.value.initialRate * 100}% for the first ${resolution.value.initialRateMonths} months, then ${resolution.value.ongoingRate * 100}%, capped at the statutory maximum wage, and the minimum duration until you confirm it.`
          : `Uses ${resolution.value.initialRate * 100}% for the first ${resolution.value.initialRateMonths} months, then ${resolution.value.ongoingRate * 100}%, capped at the statutory maximum wage, for the duration you provided.`,
    };
  }

  if (input.salaryBasisStatus === 'unlinked_fallback') {
    warnings.push('The salary source is not linked to this employment.');
  }
  if (
    input.assumptions?.severanceMonthlySalaryOverride !== null &&
    input.assumptions?.severanceMonthlySalaryOverride !== undefined
  ) {
    warnings.push(
      'Transition compensation uses your severance salary override; notice and WW use the latest payslip.',
    );
  }

  return {
    effectiveTaxRate: tax.rate,
    taxRateSource: tax.source,
    salaryBasis,
    notice,
    severance,
    unemployment,
    sources,
    warnings,
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

function buildIncomeByMonth(support: IncomeSupportCalculation | null): number[] {
  if (!support) return [];
  return [
    ...Array.from(
      { length: support.notice.status === 'included' ? (support.notice.months ?? 0) : 0 },
      () => support.notice.monthlyNet,
    ),
    ...(support.unemployment.status === 'included' ? support.unemployment.monthlyNetByMonth : []),
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
  support: IncomeSupportCalculation | null,
): {
  monthsCashOnly: number;
  monthsAllLiquid: number;
  monthsWithIncomeSupport: number | null;
  band: RunwayBand;
  ledger: RunwayLedgerEntry[];
} {
  const burn = Math.max(0, leanBurn);
  const severance = support?.severance.status === 'included' ? support.severance.net : 0;
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

// Aggregation branches mirror ownership, eligibility, and verification states in the API result.
// eslint-disable-next-line complexity
export function aggregateDepositGuarantees(
  accounts: readonly SavingsGuaranteeInput[],
  convertMoney: (amount: number, currency: CurrencyCode) => number = (amount) => amount,
): Array<{
  entityId: string | null;
  entityName: string;
  scheme: string;
  total: number;
  cap: number | null;
  excess: number | null;
  ineligibleCurrencyTotal: number;
  confidence: 'verified' | 'unverified';
  accountIds: number[];
}> {
  const groups = new Map<
    string,
    ReturnType<typeof resolveBankingEntity> & {
      total: number;
      eligibleTotal: number;
      ineligibleTotal: number;
      modelledCap: number | null;
      accountIds: number[];
    }
  >();
  for (const account of accounts) {
    const entity = resolveBankingEntity(account.bank, account.confirmedEntity);
    const key = entity.entityId ?? `unverified-account:${account.id ?? groups.size}`;
    const entityCap =
      entity.cap !== null && entity.currency !== null
        ? convertMoney(entity.cap, entity.currency)
        : null;
    const group = groups.get(key) ?? {
      ...entity,
      total: 0,
      eligibleTotal: 0,
      ineligibleTotal: 0,
      modelledCap: entityCap,
      accountIds: [],
    };
    // Without explicit ownership shares, the plan attributes half of a joint balance to this depositor.
    const attributedNative = Math.max(0, account.amount) * (account.isJoint ? JOINT_WEIGHT : 1);
    const attributedAmount = convertMoney(attributedNative, account.currency);
    const eligibleCurrencies = entity.eligibleCurrencies ?? undefined;
    group.total += attributedAmount;
    if (eligibleCurrencies && !eligibleCurrencies.includes(account.currency)) {
      group.ineligibleTotal += attributedAmount;
    } else {
      group.eligibleTotal += attributedAmount;
    }
    group.modelledCap =
      group.modelledCap === null || entityCap === null
        ? null
        : Math.min(group.modelledCap, entityCap);
    if (account.id !== undefined) group.accountIds.push(account.id);
    groups.set(key, group);
  }
  return [...groups.values()].map(({ modelledCap, eligibleTotal, ineligibleTotal, ...group }) => {
    const excess =
      modelledCap === null ? null : ineligibleTotal + Math.max(0, eligibleTotal - modelledCap);
    return {
      ...group,
      cap: modelledCap,
      excess,
      ineligibleCurrencyTotal: ineligibleTotal,
    };
  });
}
