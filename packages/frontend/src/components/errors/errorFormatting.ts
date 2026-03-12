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

export function readApiErrorMessage(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const responseError = (error as { response?: { data?: { error?: unknown } } }).response?.data
    ?.error;
  return typeof responseError === 'string' ? responseError : null;
}

export function formatUnknownErrorDetail(error: unknown): string | undefined {
  if (error instanceof Error) return formatErrorWithStack(error);

  const apiErrorMessage = readApiErrorMessage(error);
  if (apiErrorMessage) return apiErrorMessage;

  return stringifyUnknown(error);
}
