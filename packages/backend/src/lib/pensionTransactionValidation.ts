import {
  PENSION_TRANSACTION_TYPES,
  validateTaxWithinContribution,
  type PensionTransactionPayload,
  type PensionTransactionType,
} from '@quro/shared';
import {
  err,
  ok,
  parseDateString,
  parseId,
  parseMoneyField,
  type ParseResult,
} from './requestValidation';

export type RawPensionTransactionPayload = {
  potId: unknown;
  type: unknown;
  amount: unknown;
  taxAmount: unknown;
  date: unknown;
  note: unknown;
  isEmployer: unknown;
};

export type NormalizedPensionTransactionPayload = PensionTransactionPayload;

type ParsedPensionTransactionPayloadBase = Omit<
  NormalizedPensionTransactionPayload,
  'isEmployer'
> & { isEmployer: unknown };

function parsePensionTransactionType(value: unknown): PensionTransactionType | null {
  if (typeof value !== 'string') return null;
  return PENSION_TRANSACTION_TYPES.includes(value as PensionTransactionType)
    ? (value as PensionTransactionType)
    : null;
}

function parsePensionTransactionPayloadBase(
  rawPayload: RawPensionTransactionPayload,
): ParseResult<ParsedPensionTransactionPayloadBase> {
  const potId = parseId(String(rawPayload.potId ?? ''));
  if (potId === null) return err('Invalid pension pot id');

  const type = parsePensionTransactionType(rawPayload.type);
  if (!type) return err('Invalid transaction type');

  const amount = parseMoneyField(rawPayload.amount, {
    field: 'amount',
    error: 'Invalid transaction amount',
  });
  if (!amount.ok) return amount;

  const taxAmount = parseMoneyField(rawPayload.taxAmount ?? 0, {
    field: 'taxAmount',
    error: 'Invalid tax amount',
  });
  if (!taxAmount.ok) return taxAmount;

  const date = parseDateString(rawPayload.date);
  if (!date) return err('Invalid transaction date');

  return ok({
    potId,
    type,
    amount: amount.value,
    taxAmount: taxAmount.value,
    date,
    note: typeof rawPayload.note === 'string' ? rawPayload.note : '',
    isEmployer: rawPayload.isEmployer,
  });
}

function validateContributionPayload(
  base: ParsedPensionTransactionPayloadBase,
): ParseResult<NormalizedPensionTransactionPayload> {
  if (base.amount <= 0) return err('Contribution amount must be greater than zero');
  if (base.taxAmount < 0) return err('Tax amount cannot be negative');
  const taxError = validateTaxWithinContribution(base.amount, base.taxAmount);
  if (taxError) return err(taxError);
  if (typeof base.isEmployer !== 'boolean') {
    return err('Contribution requires employer/employee source');
  }
  return ok({ ...base, isEmployer: base.isEmployer });
}

function validateFeePayload(
  base: ParsedPensionTransactionPayloadBase,
): ParseResult<NormalizedPensionTransactionPayload> {
  if (base.amount <= 0) return err('Fee amount must be greater than zero');
  return ok({ ...base, taxAmount: 0, isEmployer: null });
}

function validateAnnualStatementPayload(
  base: ParsedPensionTransactionPayloadBase,
): ParseResult<NormalizedPensionTransactionPayload> {
  if (base.amount === 0) return err('Annual statement amount cannot be zero');
  return ok({ ...base, taxAmount: 0, isEmployer: null });
}

export function validatePensionTransactionPayload(
  rawPayload: RawPensionTransactionPayload,
): ParseResult<NormalizedPensionTransactionPayload> {
  const parsed = parsePensionTransactionPayloadBase(rawPayload);
  if (!parsed.ok) return parsed;

  if (parsed.value.type === 'contribution') return validateContributionPayload(parsed.value);
  if (parsed.value.type === 'fee') return validateFeePayload(parsed.value);
  return validateAnnualStatementPayload(parsed.value);
}
