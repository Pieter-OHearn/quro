import { roundMoney, type CurrencyCode } from '@quro/shared';
import { convertToBaseCurrency } from './currencyRateCache';
import { getCurrentRatesToBaseCurrency } from './currencyRateSync';

// Budget ledgers and category aggregates store EUR. An omitted input currency
// means EUR for API compatibility, never the user's mutable display preference.
export async function budgetRateToEur(currency: CurrencyCode = 'EUR'): Promise<number> {
  if (currency === 'EUR') return 1;
  return convertToBaseCurrency(1, currency, await getCurrentRatesToBaseCurrency());
}

export async function normalizeBudgetCategoryMoney<
  T extends {
    currency?: CurrencyCode;
    budgeted?: number;
    spent?: number;
  },
>(payload: T) {
  const rate = await budgetRateToEur(payload.currency);
  return {
    ...payload,
    currency: 'EUR' as const,
    budgeted: (payload.budgeted === undefined
      ? undefined
      : roundMoney(payload.budgeted * rate)) as T['budgeted'],
    spent: (payload.spent === undefined
      ? undefined
      : roundMoney(payload.spent * rate)) as T['spent'],
    // Only a complete replacement confirms both previously ambiguous fields.
    currencyNeedsReview:
      payload.budgeted !== undefined && payload.spent !== undefined ? false : undefined,
  };
}

export async function normalizeBudgetTransactionMoney<
  T extends {
    currency?: CurrencyCode;
    amount?: number;
  },
>(payload: T) {
  if (payload.amount === undefined) return { ...payload, currency: 'EUR' as const };
  const rate = await budgetRateToEur(payload.currency);
  return {
    ...payload,
    amount: roundMoney(payload.amount * rate),
    sourceAmount: payload.amount,
    sourceCurrency: payload.currency ?? 'EUR',
    currency: 'EUR' as const,
    currencyNeedsReview: false,
  };
}
