/**
 * Maximum lengths, in characters, for user-entered text. The API validators and the web
 * form inputs both read these, so the two cannot drift. Existing longer values stay readable,
 * exportable and restorable; a request that leaves such a field unchanged is not rejected.
 */
export const TEXT_LIMITS = {
  /** Names, labels, providers, lenders, banks, categories, sectors and employers. */
  name: 100,
  /** Tickers and exchange codes. */
  ticker: 32,
  /** Postal addresses. */
  address: 200,
  /** Free-form strategy descriptions. */
  strategy: 200,
  /** Descriptions, merchants and transaction notes. */
  description: 500,
  /** Long free-text notes on debts, pension pots and goals. */
  longNote: 2000,
  /** Person names. */
  personName: 100,
  /** Email addresses (RFC 5321 maximum). */
  email: 254,
  /** Emoji pickers; one glyph can span several code points. */
  emoji: 8,
  /** Colour identifiers and short codes such as units or month keys. */
  short: 32,
  /** Uploaded document file names. */
  fileName: 255,
} as const;

export type TextLimitKind = keyof typeof TEXT_LIMITS;

/** Field-to-limit maps, one per request payload. Keys are the JSON field names. */
export const TEXT_FIELD_LIMITS = {
  budgetCategory: { name: TEXT_LIMITS.name, emoji: TEXT_LIMITS.emoji, color: TEXT_LIMITS.short },
  budgetTransaction: {
    description: TEXT_LIMITS.description,
    merchant: TEXT_LIMITS.description,
  },
  categoryMapping: { categoryName: TEXT_LIMITS.name },
  debt: {
    name: TEXT_LIMITS.name,
    lender: TEXT_LIMITS.name,
    notes: TEXT_LIMITS.longNote,
    color: TEXT_LIMITS.short,
    emoji: TEXT_LIMITS.emoji,
  },
  debtPayment: { note: TEXT_LIMITS.description },
  employment: { employerName: TEXT_LIMITS.name },
  goal: {
    name: TEXT_LIMITS.name,
    emoji: TEXT_LIMITS.emoji,
    category: TEXT_LIMITS.name,
    unit: TEXT_LIMITS.short,
    color: TEXT_LIMITS.short,
    notes: TEXT_LIMITS.longNote,
    startMonth: TEXT_LIMITS.short,
    deadline: TEXT_LIMITS.short,
  },
  holding: {
    name: TEXT_LIMITS.name,
    ticker: TEXT_LIMITS.ticker,
    sector: TEXT_LIMITS.name,
    industry: TEXT_LIMITS.name,
    exchangeMic: TEXT_LIMITS.short,
    priceCurrency: TEXT_LIMITS.short,
  },
  holdingTransaction: { note: TEXT_LIMITS.description },
  mortgage: {
    lender: TEXT_LIMITS.name,
    fixedUntil: TEXT_LIMITS.short,
    startDate: TEXT_LIMITS.short,
    endDate: TEXT_LIMITS.short,
  },
  mortgageTransaction: { note: TEXT_LIMITS.description },
  pensionPot: {
    name: TEXT_LIMITS.name,
    provider: TEXT_LIMITS.name,
    investmentStrategy: TEXT_LIMITS.strategy,
    color: TEXT_LIMITS.short,
    emoji: TEXT_LIMITS.emoji,
    notes: TEXT_LIMITS.longNote,
  },
  pensionTransaction: { note: TEXT_LIMITS.description },
  property: {
    address: TEXT_LIMITS.address,
    propertyType: TEXT_LIMITS.name,
    emoji: TEXT_LIMITS.emoji,
  },
  propertyTransaction: { note: TEXT_LIMITS.description },
  payslip: { month: TEXT_LIMITS.short },
  savingsAccount: {
    name: TEXT_LIMITS.name,
    bank: TEXT_LIMITS.name,
    color: TEXT_LIMITS.short,
    emoji: TEXT_LIMITS.emoji,
  },
  bankingEntity: {
    entityId: TEXT_LIMITS.name,
    entityName: TEXT_LIMITS.name,
    scheme: TEXT_LIMITS.name,
  },
  savingsTransaction: { note: TEXT_LIMITS.description },
  profile: {
    firstName: TEXT_LIMITS.personName,
    lastName: TEXT_LIMITS.personName,
    email: TEXT_LIMITS.email,
    location: TEXT_LIMITS.name,
  },
  partnerInvite: { email: TEXT_LIMITS.email },
  signUp: {
    email: TEXT_LIMITS.email,
    firstName: TEXT_LIMITS.personName,
    lastName: TEXT_LIMITS.personName,
  },
} as const;

export type TextFieldLimitMap = Readonly<Record<string, number>>;
