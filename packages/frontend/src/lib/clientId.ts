const ID_RADIX = 36;
const RANDOM_VALUE_COUNT = 2;
const FALLBACK_RANDOM_START_INDEX = 2;
const FALLBACK_RANDOM_END_INDEX = 10;

export function createClientId(prefix = 'id'): string {
  const safePrefix = prefix.trim() || 'id';
  const cryptoApi = globalThis.crypto;

  if (typeof cryptoApi?.randomUUID === 'function') {
    return `${safePrefix}-${cryptoApi.randomUUID()}`;
  }

  if (typeof cryptoApi?.getRandomValues === 'function') {
    const values = new Uint32Array(RANDOM_VALUE_COUNT);
    cryptoApi.getRandomValues(values);
    return `${safePrefix}-${Date.now().toString(ID_RADIX)}-${values[0].toString(ID_RADIX)}${values[1].toString(ID_RADIX)}`;
  }

  return `${safePrefix}-${Date.now().toString(ID_RADIX)}-${Math.random()
    .toString(ID_RADIX)
    .slice(FALLBACK_RANDOM_START_INDEX, FALLBACK_RANDOM_END_INDEX)}`;
}
