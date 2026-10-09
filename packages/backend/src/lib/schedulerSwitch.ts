// QRO_DISABLE_SCHEDULERS turns off every interval scheduler (session cleanup, bunq sync, holding
// prices, currency rates, net-worth snapshots). The smoke tests set it so a test backend never
// calls a provider. Production and the Docker stack leave it unset, so the schedulers run.
const TRUE_VALUES = new Set(['1', 'true', 'yes']);
const FALSE_VALUES = new Set(['', '0', 'false', 'no']);

export function schedulersDisabled(env: Record<string, string | undefined> = process.env): boolean {
  const value = (env.QRO_DISABLE_SCHEDULERS ?? '').trim().toLowerCase();
  if (TRUE_VALUES.has(value)) return true;
  if (FALSE_VALUES.has(value)) return false;
  // The value is a plain switch, never a secret, so naming the expected forms is safe.
  throw new Error('QRO_DISABLE_SCHEDULERS must be true, false, 1, 0, yes or no');
}
