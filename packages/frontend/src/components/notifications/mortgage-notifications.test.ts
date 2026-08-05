import { describe, expect, it } from 'bun:test';
import type { Mortgage } from '@quro/shared';
import {
  buildMortgageExpiryNotification,
  buildMortgageExpiryNotifications,
  mortgageDismissalStorageKey,
  parseDismissedNotificationKeys,
} from './mortgage-notifications';

const mortgage: Mortgage = {
  id: 42,
  propertyAddress: '1 Canal Street',
  lender: 'Quro Bank',
  currency: 'EUR',
  originalAmount: 705_000,
  outstandingBalance: 705_000,
  propertyValue: 900_000,
  monthlyPayment: 3000,
  interestRate: 2.5,
  rateType: 'Fixed',
  repaymentType: 'Annuity',
  fixedUntil: '2030-08-15',
  termYears: 30,
  startDate: '2025-01-01',
  endDate: '2055-01-01',
  overpaymentLimit: 100,
  isJoint: false,
};

describe('mortgage expiry notifications', () => {
  it('starts at the six-month boundary and expires after the fixed date', () => {
    expect(buildMortgageExpiryNotification(mortgage, new Date('2030-02-14T12:00:00Z'))).toBeNull();
    expect(
      buildMortgageExpiryNotification(mortgage, new Date('2030-02-15T12:00:00Z')),
    ).not.toBeNull();
    expect(buildMortgageExpiryNotification(mortgage, new Date('2030-08-16T12:00:00Z'))).toBeNull();
  });

  it('handles month precision and suppresses variable, missing, and malformed dates', () => {
    expect(
      buildMortgageExpiryNotification(
        { ...mortgage, fixedUntil: '2030-08' },
        new Date('2030-02-28T12:00:00Z'),
      ),
    ).not.toBeNull();
    expect(
      buildMortgageExpiryNotification(
        { ...mortgage, rateType: 'Variable' },
        new Date('2030-02-15T12:00:00Z'),
      ),
    ).toBeNull();
    expect(
      buildMortgageExpiryNotification(
        { ...mortgage, fixedUntil: 'N/A' },
        new Date('2030-02-15T12:00:00Z'),
      ),
    ).toBeNull();
    expect(
      buildMortgageExpiryNotification(
        { ...mortgage, fixedUntil: '2030-02-31' },
        new Date('2029-08-31T12:00:00Z'),
      ),
    ).toBeNull();
  });

  it('never turns an extreme allowance into an automatic monthly recommendation', () => {
    const notification = buildMortgageExpiryNotification(
      mortgage,
      new Date('2030-02-15T12:00:00Z'),
    );

    expect(notification?.body).not.toContain('58,750');
    expect(notification?.body).not.toContain('/month');
    expect(notification?.body).not.toContain('overpay');
  });

  it('deduplicates events, respects dismissals, and versions changed fixed dates', () => {
    const today = new Date('2030-02-15T12:00:00Z');
    const initial = buildMortgageExpiryNotification(mortgage, today)!;
    expect(buildMortgageExpiryNotifications([mortgage, mortgage], new Set(), today)).toHaveLength(
      1,
    );
    expect(
      buildMortgageExpiryNotifications([mortgage], new Set([initial.dismissalKey]), today),
    ).toHaveLength(0);

    const changed = buildMortgageExpiryNotification(
      { ...mortgage, fixedUntil: '2030-09-15' },
      new Date('2030-03-15T12:00:00Z'),
    );
    expect(changed?.dismissalKey).not.toBe(initial.dismissalKey);
  });

  it('stores dismissals separately per user and safely parses persisted keys', () => {
    expect(mortgageDismissalStorageKey(1)).not.toBe(mortgageDismissalStorageKey(2));
    expect([...parseDismissedNotificationKeys('["one",2,"two"]')]).toEqual(['one', 'two']);
    expect(parseDismissedNotificationKeys('not json').size).toBe(0);
  });
});
