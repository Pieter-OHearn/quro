export type BankingEntity = {
  id: string;
  name: string;
  scheme: string;
  aliases: string[];
};

export type BankingEntityResolution = {
  entityId: string | null;
  entityName: string;
  scheme: string;
  confidence: 'verified' | 'unverified';
};

const LEGAL_SUFFIXES =
  /\b(bank|banking|n\.v\.?|nv|b\.v\.?|bv|plc|se|ag|s\.a\.?|sa|uab|gmbh|limited|ltd)\b/g;
const NON_ALPHANUMERIC = /[^a-z0-9]+/g;

export function normalizeBankName(value: string): string {
  return value.toLowerCase().replace(LEGAL_SUFFIXES, ' ').replace(NON_ALPHANUMERIC, '').trim();
}

export const BANKING_ENTITIES: BankingEntity[] = [
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

const ENTITY_BY_ALIAS = new Map(
  BANKING_ENTITIES.flatMap((entity) =>
    entity.aliases.map((alias) => [normalizeBankName(alias), entity] as const),
  ),
);

export function resolveBankingEntity(bankName: string): BankingEntityResolution {
  const normalized = normalizeBankName(bankName);
  const entity = ENTITY_BY_ALIAS.get(normalized);
  if (entity) {
    return {
      entityId: entity.id,
      entityName: entity.name,
      scheme: entity.scheme,
      confidence: 'verified',
    };
  }
  return {
    entityId: null,
    entityName: bankName.trim() || 'Unknown bank',
    scheme: 'Unverified deposit guarantee',
    confidence: 'unverified',
  };
}
