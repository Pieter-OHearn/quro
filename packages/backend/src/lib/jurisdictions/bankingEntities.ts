import type { CurrencyCode } from '@quro/shared';

export type BankingEntity = {
  id: string;
  name: string;
  scheme: string;
  cap: number;
  currency: CurrencyCode;
  eligibleCurrencies: CurrencyCode[] | null;
  country: string;
  aliases: string[];
};

export type BankingEntityResolution = {
  entityId: string | null;
  entityName: string;
  scheme: string;
  cap: number | null;
  currency: CurrencyCode | null;
  eligibleCurrencies: CurrencyCode[] | null;
  confidence: 'verified' | 'unverified';
};

export type ConfirmedBankingEntity = {
  entityId: string | null;
  entityName: string | null;
  scheme: string | null;
  cap: number | null;
  currency: CurrencyCode | null;
};

const LEGAL_SUFFIXES =
  /\b(bank|banking|n\.v\.?|nv|b\.v\.?|bv|plc|se|ag|s\.a\.?|sa|uab|gmbh|limited|ltd)\b/g;
const NON_ALPHANUMERIC = /[^a-z0-9]+/g;

function normalizeLegalName(value: string): string {
  return value.toLowerCase().replace(NON_ALPHANUMERIC, '').trim();
}

export function normalizeBankName(value: string): string {
  return value.toLowerCase().replace(LEGAL_SUFFIXES, ' ').replace(NON_ALPHANUMERIC, '').trim();
}

const EU_DEPOSIT_GUARANTEE = { cap: 100_000, currency: 'EUR' as const };

const BANKING_ENTITY_PROFILES: Array<
  Omit<BankingEntity, 'cap' | 'currency' | 'eligibleCurrencies' | 'country'>
> = [
  {
    id: 'bunq',
    name: 'bunq B.V.',
    scheme: 'Nederlandse Depositogarantie',
    aliases: ['bunq', 'bunq bank', 'bunq b.v.', 'bunq n.v.'],
  },
  {
    id: 'de-volksbank',
    name: 'de Volksbank N.V.',
    scheme: 'Nederlandse Depositogarantie',
    aliases: ['de volksbank', 'asn bank', 'sns', 'sns bank', 'regiobank', 'blg wonen'],
  },
  {
    id: 'ing-nl',
    name: 'ING Bank N.V.',
    scheme: 'Nederlandse Depositogarantie',
    aliases: ['ing', 'ing bank'],
  },
  {
    id: 'abn-amro',
    name: 'ABN AMRO Bank N.V.',
    scheme: 'Nederlandse Depositogarantie',
    aliases: ['abn amro', 'abn amro bank', 'moneyou'],
  },
  {
    id: 'rabobank',
    name: 'Coöperatieve Rabobank U.A.',
    scheme: 'Nederlandse Depositogarantie',
    aliases: ['rabobank', 'rabo'],
  },
  {
    id: 'triodos',
    name: 'Triodos Bank N.V.',
    scheme: 'Nederlandse Depositogarantie',
    aliases: ['triodos', 'triodos bank'],
  },
  {
    id: 'nibc',
    name: 'NIBC Bank N.V.',
    scheme: 'Nederlandse Depositogarantie',
    aliases: ['nibc', 'nibc direct'],
  },
  {
    id: 'van-lanschot-kempen',
    name: 'Van Lanschot Kempen N.V.',
    scheme: 'Nederlandse Depositogarantie',
    aliases: ['van lanschot', 'van lanschot kempen', 'evi van lanschot'],
  },
  {
    id: 'nn-bank',
    name: 'Nationale-Nederlanden Bank N.V.',
    scheme: 'Nederlandse Depositogarantie',
    aliases: ['nationale nederlanden', 'nn bank', 'nn'],
  },
  {
    id: 'achmea-bank',
    name: 'Achmea Bank N.V.',
    scheme: 'Nederlandse Depositogarantie',
    aliases: ['achmea', 'achmea bank', 'centraal beheer'],
  },
  {
    id: 'dhb-bank',
    name: 'DHB Bank N.V.',
    scheme: 'Nederlandse Depositogarantie',
    aliases: ['dhb', 'dhb bank'],
  },
  {
    id: 'garanti-bbva',
    name: 'GarantiBank International N.V.',
    scheme: 'Nederlandse Depositogarantie',
    aliases: ['garanti', 'garantibank', 'garanti bbva'],
  },
  {
    id: 'yapi-kredi-nl',
    name: 'Yapi Kredi Bank Nederland N.V.',
    scheme: 'Nederlandse Depositogarantie',
    aliases: ['yapi kredi', 'yapi kredi nederland'],
  },
  {
    id: 'revolut-uab',
    name: 'Revolut Bank UAB',
    scheme: 'Lithuanian deposit guarantee',
    aliases: ['revolut', 'revolut bank'],
  },
  {
    id: 'n26',
    name: 'N26 Bank SE',
    scheme: 'German deposit guarantee',
    aliases: ['n26', 'n26 bank'],
  },
  {
    id: 'trade-republic',
    name: 'Trade Republic Bank GmbH',
    scheme: 'German deposit guarantee',
    aliases: ['trade republic', 'trade republic bank'],
  },
  {
    id: 'deutsche-bank',
    name: 'Deutsche Bank AG',
    scheme: 'German deposit guarantee',
    aliases: ['deutsche bank'],
  },
  {
    id: 'commerzbank',
    name: 'Commerzbank AG',
    scheme: 'German deposit guarantee',
    aliases: ['commerzbank'],
  },
  {
    id: 'barclays-ireland',
    name: 'Barclays Bank Ireland PLC',
    scheme: 'Irish Deposit Guarantee Scheme',
    aliases: ['barclays', 'barclays bank ireland'],
  },
  {
    id: 'hsbc-continental',
    name: 'HSBC Continental Europe S.A.',
    scheme: 'French deposit guarantee',
    aliases: ['hsbc', 'hsbc continental europe'],
  },
];

const AU_FINANCIAL_CLAIMS_SCHEME = {
  cap: 250_000,
  currency: 'AUD' as const,
  scheme: 'Australian Financial Claims Scheme (AUD deposits only)',
};

const AU_BANKING_ENTITY_PROFILES: Array<
  Omit<BankingEntity, 'cap' | 'currency' | 'scheme' | 'eligibleCurrencies' | 'country'>
> = [
  {
    id: 'cba-au',
    name: 'Commonwealth Bank of Australia',
    aliases: ['commonwealth bank', 'commonwealth bank of australia', 'commbank', 'cba', 'bankwest'],
  },
  {
    id: 'westpac-au',
    name: 'Westpac Banking Corporation',
    aliases: [
      'westpac',
      'westpac bank',
      'st george',
      'st.george',
      'banksa',
      'bank of melbourne',
      'rams',
    ],
  },
  {
    id: 'nab-au',
    name: 'National Australia Bank Limited',
    aliases: ['national australia bank', 'nab', 'ubank', 'citi australia', 'citibank australia'],
  },
  {
    id: 'anz-au',
    name: 'Australia and New Zealand Banking Group Limited',
    aliases: ['anz', 'anz bank', 'australia and new zealand banking group'],
  },
  {
    id: 'ing-au',
    name: 'ING Bank (Australia) Limited',
    aliases: ['ing', 'ing australia', 'ing bank australia'],
  },
  {
    id: 'macquarie-au',
    name: 'Macquarie Bank Limited',
    aliases: ['macquarie', 'macquarie bank'],
  },
  {
    id: 'boq-au',
    name: 'Bank of Queensland Limited',
    aliases: ['bank of queensland', 'boq', 'me bank', 'virgin money australia'],
  },
  {
    id: 'bendigo-adelaide-au',
    name: 'Bendigo and Adelaide Bank Limited',
    aliases: ['bendigo bank', 'adelaide bank', 'bendigo and adelaide bank', 'up', 'up bank'],
  },
  {
    id: 'amp-au',
    name: 'AMP Bank Limited',
    aliases: ['amp', 'amp bank'],
  },
  {
    id: 'great-southern-au',
    name: 'Great Southern Bank',
    aliases: ['great southern bank', 'credit union australia', 'cua'],
  },
];

export const BANKING_ENTITIES: BankingEntity[] = [
  ...BANKING_ENTITY_PROFILES.map((entity) => ({
    ...entity,
    ...EU_DEPOSIT_GUARANTEE,
    eligibleCurrencies: null,
    country:
      entity.scheme === 'Lithuanian deposit guarantee'
        ? 'LT'
        : entity.scheme === 'German deposit guarantee'
          ? 'DE'
          : entity.scheme === 'Irish Deposit Guarantee Scheme'
            ? 'IE'
            : entity.scheme === 'French deposit guarantee'
              ? 'FR'
              : 'NL',
  })),
  ...AU_BANKING_ENTITY_PROFILES.map((entity) => ({
    ...entity,
    ...AU_FINANCIAL_CLAIMS_SCHEME,
    eligibleCurrencies: ['AUD'] as CurrencyCode[],
    country: 'AU',
  })),
];

const ENTITY_BY_ALIAS = new Map<string, BankingEntity[]>();
for (const entity of BANKING_ENTITIES) {
  for (const alias of entity.aliases) {
    const normalized = normalizeBankName(alias);
    const candidates = ENTITY_BY_ALIAS.get(normalized) ?? [];
    if (!candidates.some((candidate) => candidate.id === entity.id)) {
      ENTITY_BY_ALIAS.set(normalized, [...candidates, entity]);
    }
  }
}

const ENTITY_BY_ID = new Map(BANKING_ENTITIES.map((entity) => [entity.id, entity] as const));
const ENTITY_BY_LEGAL_NAME = new Map(
  BANKING_ENTITIES.map((entity) => [normalizeLegalName(entity.name), entity] as const),
);

export function getBankingEntity(entityId: string): BankingEntity | null {
  return ENTITY_BY_ID.get(entityId) ?? null;
}

export function buildManualBankingEntityId(entityName: string): string {
  return `manual:${normalizeBankName(entityName)}`;
}

// Persisted catalog selections are global. Automatic aliases resolve only when the catalog has
// exactly one candidate; generic brands such as ING require explicit user confirmation.
// eslint-disable-next-line complexity
export function resolveBankingEntity(
  bankName: string,
  confirmed?: ConfirmedBankingEntity | null,
): BankingEntityResolution {
  if (confirmed?.entityId) {
    const known = getBankingEntity(confirmed.entityId);
    if (known) {
      return {
        entityId: known.id,
        entityName: known.name,
        scheme: known.scheme,
        cap: known.cap,
        currency: known.currency,
        eligibleCurrencies: known.eligibleCurrencies,
        confidence: 'verified',
      };
    }
    if (!known && confirmed.entityName && confirmed.scheme && confirmed.cap && confirmed.currency) {
      return {
        entityId: confirmed.entityId,
        entityName: confirmed.entityName,
        scheme: confirmed.scheme,
        cap: confirmed.cap,
        currency: confirmed.currency,
        eligibleCurrencies: null,
        confidence: 'verified',
      };
    }
  }
  const exactLegalEntity = ENTITY_BY_LEGAL_NAME.get(normalizeLegalName(bankName));
  if (exactLegalEntity) {
    return {
      entityId: exactLegalEntity.id,
      entityName: exactLegalEntity.name,
      scheme: exactLegalEntity.scheme,
      cap: exactLegalEntity.cap,
      currency: exactLegalEntity.currency,
      eligibleCurrencies: exactLegalEntity.eligibleCurrencies,
      confidence: 'verified',
    };
  }
  const normalized = normalizeBankName(bankName);
  const candidates = ENTITY_BY_ALIAS.get(normalized) ?? [];
  const entity = candidates.length === 1 ? candidates[0] : null;
  if (entity) {
    return {
      entityId: entity.id,
      entityName: entity.name,
      scheme: entity.scheme,
      cap: entity.cap,
      currency: entity.currency,
      eligibleCurrencies: entity.eligibleCurrencies,
      confidence: 'verified',
    };
  }
  return {
    entityId: null,
    entityName: bankName.trim() || 'Unknown bank',
    scheme: 'Unverified deposit guarantee',
    cap: null,
    currency: null,
    eligibleCurrencies: null,
    confidence: 'unverified',
  };
}
