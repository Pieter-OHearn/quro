const FIVE_MINUTES_MS = 300_000;
const RATE_LIMIT_RETRY_MS = 30_000;
const RATE_LIMIT_STATUS = 429;
const DEFAULT_TOKEN_EXPIRY_SECONDS = 3_600;

const isSandbox = process.env.BUNQ_SANDBOX === 'true';
const API_BASE_URL = isSandbox
  ? 'https://public-api.sandbox.bunq.com/v1'
  : 'https://api.bunq.com/v1';
const OAUTH_BASE_URL = isSandbox
  ? 'https://api-oauth.sandbox.bunq.com/v1'
  : 'https://api.oauth.bunq.com/v1';
const CLIENT_ID = process.env.BUNQ_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.BUNQ_CLIENT_SECRET ?? '';
const REDIRECT_URI = process.env.BUNQ_REDIRECT_URI ?? '';

// ── Types ─────────────────────────────────────────────────────────────────────

export type BunqTokens = {
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
};

export type BunqTokenResponse = BunqTokens & { bunqUserId: string };

export type BunqMonetaryAccount = {
  id: number;
  type: 'BANK' | 'SAVINGS';
  description: string;
  balance: { value: string; currency: string };
  iban: string | null;
  status: string;
};

export type BunqPayment = {
  id: number;
  amount: { value: string; currency: string };
  description: string;
  counterpartyAlias: { displayName: string; iban?: string };
  created: string; // ISO datetime
  category: string | null;
  type: string;
};

export type BunqDataResult<T> = {
  data: T;
  tokens: BunqTokens;
};

// ── Private helpers ───────────────────────────────────────────────────────────

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getString(obj: Readonly<UnknownRecord>, key: string): string | null {
  const value = obj[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function extractErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const oauthDescription = getString(payload, 'error_description');
  if (oauthDescription) return oauthDescription;
  const oauthError = getString(payload, 'error');
  if (oauthError) return oauthError;
  const errors = payload.Error;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const first = errors[0];
  if (!isRecord(first)) return null;
  return getString(first, 'error_description') ?? getString(first, 'error_message');
}

function extractBunqItems(payload: unknown, typeName: string): Readonly<UnknownRecord>[] {
  if (!isRecord(payload)) return [];
  const response = payload.Response;
  if (!Array.isArray(response)) return [];
  return response.flatMap((item: unknown) => {
    if (!isRecord(item)) return [];
    const inner = item[typeName];
    return isRecord(inner) ? [inner] : [];
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function performFetch(url: string, init: RequestInit): Promise<unknown> {
  let response = await fetch(url, init);
  if (response.status === RATE_LIMIT_STATUS) {
    await sleep(RATE_LIMIT_RETRY_MS);
    response = await fetch(url, init);
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const msg = extractErrorMessage(payload);
    throw new Error(msg ?? `Bunq request failed (${response.status}): ${url}`);
  }
  return payload;
}

function apiGet(url: string, accessToken: string): Promise<unknown> {
  return performFetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

function oauthPost(params: Readonly<Record<string, string>>): Promise<unknown> {
  return performFetch(`${OAUTH_BASE_URL}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
}

function parseTokens(payload: unknown): BunqTokens {
  if (!isRecord(payload)) throw new Error('Invalid token response from Bunq');
  const accessToken = getString(payload, 'access_token');
  const refreshToken = getString(payload, 'refresh_token');
  const expiresIn =
    typeof payload.expires_in === 'number' ? payload.expires_in : DEFAULT_TOKEN_EXPIRY_SECONDS;
  if (!accessToken || !refreshToken) throw new Error('Missing tokens in Bunq response');
  return {
    accessToken,
    refreshToken,
    tokenExpiresAt: new Date(Date.now() + expiresIn * 1_000),
  };
}

async function fetchBunqUserId(accessToken: string): Promise<string> {
  const payload = await apiGet(`${API_BASE_URL}/user`, accessToken);
  const userTypes = ['UserPerson', 'UserCompany', 'UserLight', 'UserApiKey'];
  for (const typeName of userTypes) {
    const items = extractBunqItems(payload, typeName);
    if (items.length === 0) continue;
    const rawId = items[0].id;
    if (typeof rawId === 'number') return String(rawId);
    const strId = getString(items[0], 'id');
    if (strId) return strId;
  }
  throw new Error('Could not determine Bunq user ID from /user response');
}

async function ensureFreshTokens(tokens: Readonly<BunqTokens>): Promise<BunqTokens> {
  if (tokens.tokenExpiresAt.getTime() - Date.now() > FIVE_MINUTES_MS) {
    return { ...tokens };
  }
  const refreshed = await refreshAccessToken(tokens.refreshToken);
  return refreshed;
}

function parseCurrencyAmount(data: Readonly<UnknownRecord>): { value: string; currency: string } {
  return {
    value: getString(data, 'value') ?? '0',
    currency: getString(data, 'currency') ?? '',
  };
}

function extractIban(aliases: readonly unknown[]): string | null {
  const ibanAlias = aliases.find((a) => isRecord(a) && getString(a, 'type') === 'IBAN');
  return isRecord(ibanAlias) ? getString(ibanAlias, 'value') : null;
}

function buildCounterpartyAlias(
  counterparty: Readonly<UnknownRecord>,
  ibanValue: string | null,
): { displayName: string; iban?: string } {
  const displayName =
    getString(counterparty, 'display_name') ?? getString(counterparty, 'name') ?? '';
  return ibanValue !== null ? { displayName, iban: ibanValue } : { displayName };
}

function parseMonetaryAccount(
  typeName: string,
  data: Readonly<UnknownRecord>,
): BunqMonetaryAccount | null {
  const rawId = data.id;
  const id = typeof rawId === 'number' ? rawId : null;
  if (id === null) return null;
  const type = typeName === 'MonetaryAccountSavings' ? 'SAVINGS' : 'BANK';
  const balanceData = isRecord(data.balance) ? data.balance : {};
  const aliases = Array.isArray(data.alias) ? data.alias : [];
  return {
    id,
    type,
    description: getString(data, 'description') ?? '',
    balance: parseCurrencyAmount(balanceData),
    iban: extractIban(aliases),
    status: getString(data, 'status') ?? '',
  };
}

function parseMonetaryAccounts(payload: unknown): BunqMonetaryAccount[] {
  const types = ['MonetaryAccountBank', 'MonetaryAccountSavings'];
  return types.flatMap((typeName) =>
    extractBunqItems(payload, typeName)
      .map((data) => parseMonetaryAccount(typeName, data))
      .filter((a): a is BunqMonetaryAccount => a !== null),
  );
}

function parsePayment(data: Readonly<UnknownRecord>): BunqPayment | null {
  const rawId = data.id;
  const id = typeof rawId === 'number' ? rawId : null;
  if (id === null) return null;
  const amount = isRecord(data.amount) ? data.amount : {};
  const counterparty = isRecord(data.counterparty_alias) ? data.counterparty_alias : {};
  const ibanValue = getString(counterparty, 'iban');
  return {
    id,
    amount: parseCurrencyAmount(amount),
    description: getString(data, 'description') ?? '',
    counterpartyAlias: buildCounterpartyAlias(counterparty, ibanValue),
    created: getString(data, 'created') ?? '',
    category: getString(data, 'category'),
    type: getString(data, 'type') ?? '',
  };
}

// ── Exported functions ────────────────────────────────────────────────────────

export async function exchangeCodeForTokens(code: string): Promise<BunqTokenResponse> {
  const payload = await oauthPost({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });
  const tokens = parseTokens(payload);
  const bunqUserId = await fetchBunqUserId(tokens.accessToken);
  return { ...tokens, bunqUserId };
}

export async function refreshAccessToken(refreshToken: string): Promise<BunqTokens> {
  const payload = await oauthPost({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });
  return parseTokens(payload);
}

export async function fetchMonetaryAccounts(
  tokens: Readonly<BunqTokens>,
): Promise<BunqDataResult<BunqMonetaryAccount[]>> {
  const fresh = await ensureFreshTokens(tokens);
  const userId = await fetchBunqUserId(fresh.accessToken);
  const payload = await apiGet(
    `${API_BASE_URL}/user/${userId}/monetary-account`,
    fresh.accessToken,
  );
  return {
    data: parseMonetaryAccounts(payload),
    tokens: fresh,
  };
}

export async function fetchPayments(
  tokens: Readonly<BunqTokens>,
  bunqUserId: string,
  accountId: number,
  newerThan?: string,
): Promise<BunqDataResult<BunqPayment[]>> {
  const fresh = await ensureFreshTokens(tokens);
  const url = new URL(`${API_BASE_URL}/user/${bunqUserId}/monetary-account/${accountId}/payment`);
  if (newerThan !== undefined) url.searchParams.set('newer_than', newerThan);
  const payload = await apiGet(url.toString(), fresh.accessToken);
  return {
    data: extractBunqItems(payload, 'Payment')
      .map(parsePayment)
      .filter((p): p is BunqPayment => p !== null),
    tokens: fresh,
  };
}
