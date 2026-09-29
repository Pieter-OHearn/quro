import type {
  Debt,
  DebtPayment,
  MortgageTransaction,
  PensionTransaction,
  PropertyTransaction,
} from './index.js';

/** Request bodies for the create/update endpoints, shared by the API and the web client. */
export type DebtPayload = Omit<Debt, 'id' | 'archivedAt'>;

export type DebtPaymentPayload = Omit<DebtPayment, 'id'>;

export type MortgageTransactionPayload = Omit<MortgageTransaction, 'id' | 'note'> & {
  note: string | null;
};

export type PropertyTransactionPayload = Omit<PropertyTransaction, 'id' | 'note'> & {
  note: string | null;
};

export type PensionTransactionPayload = Omit<PensionTransaction, 'id'>;
