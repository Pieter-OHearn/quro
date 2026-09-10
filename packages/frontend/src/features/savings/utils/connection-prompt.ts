export function savingsConnectionPromptStorageKey(userId: number): string {
  return `quro:savings-connection-prompt-dismissed:${userId}`;
}

export function hasDismissedSavingsConnectionPrompt(
  storage: Pick<Storage, 'getItem'>,
  userId: number,
): boolean {
  return storage.getItem(savingsConnectionPromptStorageKey(userId)) === 'true';
}

export type SavingsConnectionPromptVisibility = {
  userId: number | undefined;
  isLoading: boolean;
  isError: boolean;
  hasConnection: boolean;
  dismissed: boolean | null;
};

export function shouldShowSavingsConnectionPrompt({
  userId,
  isLoading,
  isError,
  hasConnection,
  dismissed,
}: Readonly<SavingsConnectionPromptVisibility>): boolean {
  return userId !== undefined && !isLoading && !isError && !hasConnection && dismissed === false;
}

export type BunqOAuthOutcome = 'connected' | 'error';

export function resolveBunqOAuthOutcome(value: string | null): BunqOAuthOutcome | null {
  return value === 'connected' || value === 'error' ? value : null;
}
