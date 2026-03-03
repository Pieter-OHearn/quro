type AuthErrorResponse = {
  response?: {
    data?: {
      error?: unknown;
    };
  };
};

export function getAuthErrorMessage(error: unknown, fallback: string): string {
  if (typeof error !== 'object' || error === null) {
    return fallback;
  }

  const authError = error as AuthErrorResponse;
  return typeof authError.response?.data?.error === 'string'
    ? authError.response.data.error
    : fallback;
}
