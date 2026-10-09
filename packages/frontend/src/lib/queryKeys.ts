// Prefixes are shared by query producers and the domain dependency map.
export const queryKeys = {
  dashboard: {
    all: ['dashboard'] as const,
    summary: ['dashboard', 'summary'] as const,
    transactions: ['dashboard', 'transactions'] as const,
    insights: ['dashboard', 'insights'] as const,
    insightYear: (year: number) => ['dashboard', 'insights', year] as const,
  },
  budget: {
    all: ['budget'] as const,
    categories: ['budget', 'categories'] as const,
    categoryList: (month?: string, year?: number) => ['budget', 'categories', month, year] as const,
    allCategories: ['budget', 'categories', 'all'] as const,
    transactions: ['budget', 'transactions'] as const,
    transactionList: (month?: string, year?: number, categoryId?: number) =>
      ['budget', 'transactions', month, year, categoryId] as const,
    mappings: ['budget', 'category-mappings'] as const,
  },
  savings: {
    accounts: ['savings', 'accounts'] as const,
    accountList: (includeArchived: boolean) =>
      ['savings', 'accounts', { includeArchived }] as const,
    transactions: ['savings', 'transactions'] as const,
    transactionList: (accountId?: number) => ['savings', 'transactions', accountId] as const,
    bankingEntities: ['savings', 'banking-entities'] as const,
  },
  investments: {
    holdings: ['investments', 'holdings'] as const,
    archivedHoldings: ['investments', 'holdings', 'archived'] as const,
    holdingTransactions: ['investments', 'holdingTransactions'] as const,
    holdingTransactionList: (holdingId?: number) =>
      ['investments', 'holdingTransactions', holdingId] as const,
    prices: ['investments', 'holdingPriceHistory'] as const,
    priceHistory: (ids: string, from: string, to: string) =>
      ['investments', 'holdingPriceHistory', ids, from, to] as const,
    properties: ['investments', 'properties'] as const,
    archivedProperties: ['investments', 'properties', 'archived'] as const,
    propertyTransactions: ['investments', 'propertyTransactions'] as const,
    propertyTransactionList: (propertyId?: number) =>
      ['investments', 'propertyTransactions', propertyId] as const,
  },
  mortgages: {
    all: ['mortgages'] as const,
    archived: ['mortgages', 'archived'] as const,
    transactions: (mortgageId?: number) => ['mortgages', 'transactions', mortgageId] as const,
  },
  debts: {
    all: ['debts'] as const,
    archived: ['debts', 'archived'] as const,
    payments: (debtId: number | 'all') => ['debts', 'payments', debtId] as const,
  },
  pensions: {
    pots: ['pensions', 'pots'] as const,
    archivedPots: ['pensions', 'pots', 'archived'] as const,
    transactions: ['pensions', 'transactions'] as const,
    transactionList: (potId?: number) => ['pensions', 'transactions', potId] as const,
    documents: ['pensions', 'documents'] as const,
    documentList: (potId?: number) => ['pensions', 'documents', potId] as const,
    imports: ['pensions', 'imports'] as const,
    import: (id: number | null) => ['pensions', 'imports', id] as const,
    importRows: (id: number | null) => ['pensions', 'imports', id, 'rows'] as const,
    importFeed: ['pensions', 'imports', 'list'] as const,
    notifications: ['pensions', 'imports', 'notifications'] as const,
    notificationList: (statuses: string, limit: number) =>
      ['pensions', 'imports', 'notifications', statuses, limit] as const,
  },
  salary: {
    all: ['salary'] as const,
    payslips: ['salary', 'payslips'] as const,
    history: ['salary', 'history'] as const,
  },
  plan: {
    all: ['plan'] as const,
    runway: ['plan', 'runway'] as const,
    assumptions: ['plan', 'assumptions'] as const,
  },
  goals: ['goals'] as const,
  employments: ['employments'] as const,
  partner: ['partner'] as const,
  bunqConnection: ['bunq', 'connection'] as const,
  currencyRates: ['currency', 'rates'] as const,
  capabilities: ['app', 'capabilities'] as const,
  registrationPolicy: ['auth', 'registration'] as const,
  sessions: ['settings', 'sessions'] as const,
};
