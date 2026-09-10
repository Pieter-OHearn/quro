import { describe, expect, it } from 'bun:test';
import {
  hasDismissedSavingsConnectionPrompt,
  resolveBunqOAuthOutcome,
  savingsConnectionPromptStorageKey,
  shouldShowSavingsConnectionPrompt,
} from './connection-prompt';

describe('savings connection prompt dismissal', () => {
  it('stores the preference separately for each user', () => {
    expect(savingsConnectionPromptStorageKey(1)).not.toBe(savingsConnectionPromptStorageKey(2));
  });

  it('only treats an explicit true value as dismissed', () => {
    expect(hasDismissedSavingsConnectionPrompt({ getItem: () => 'true' }, 1)).toBe(true);
    expect(hasDismissedSavingsConnectionPrompt({ getItem: () => null }, 1)).toBe(false);
    expect(hasDismissedSavingsConnectionPrompt({ getItem: () => 'false' }, 1)).toBe(false);
  });

  it('only shows after all visibility checks have passed', () => {
    const visibleState = {
      userId: 1,
      isLoading: false,
      isError: false,
      hasConnection: false,
      dismissed: false,
    } as const;

    expect(shouldShowSavingsConnectionPrompt(visibleState)).toBe(true);
    expect(shouldShowSavingsConnectionPrompt({ ...visibleState, userId: undefined })).toBe(false);
    expect(shouldShowSavingsConnectionPrompt({ ...visibleState, isLoading: true })).toBe(false);
    expect(shouldShowSavingsConnectionPrompt({ ...visibleState, isError: true })).toBe(false);
    expect(shouldShowSavingsConnectionPrompt({ ...visibleState, hasConnection: true })).toBe(false);
    expect(shouldShowSavingsConnectionPrompt({ ...visibleState, dismissed: true })).toBe(false);
    expect(shouldShowSavingsConnectionPrompt({ ...visibleState, dismissed: null })).toBe(false);
  });

  it('accepts only supported OAuth outcomes', () => {
    expect(resolveBunqOAuthOutcome('connected')).toBe('connected');
    expect(resolveBunqOAuthOutcome('error')).toBe('error');
    expect(resolveBunqOAuthOutcome('anything-else')).toBeNull();
    expect(resolveBunqOAuthOutcome(null)).toBeNull();
  });
});
