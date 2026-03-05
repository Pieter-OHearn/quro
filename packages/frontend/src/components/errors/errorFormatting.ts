export function stringifyUnknown(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function formatErrorWithStack(error: Error): string {
  return `${error.name}: ${error.message}${error.stack ? `\n\n${error.stack}` : ''}`;
}
