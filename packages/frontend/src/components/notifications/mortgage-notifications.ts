import type { Mortgage } from '@quro/shared';
import type { MortgageNotificationItem } from './types';

const ACTION_WINDOW_MONTHS = 6;
const YEAR_MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const ISO_DATE_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

type ParsedExpiry = {
  value: Date;
  monthPrecision: boolean;
};

function parseFixedUntil(raw: string): ParsedExpiry | null {
  const value = raw.trim();
  const match = YEAR_MONTH_PATTERN.exec(value) ?? ISO_DATE_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = match[3] === undefined ? 1 : Number(match[3]);
  const parsed = new Date(Date.UTC(year, monthIndex, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== monthIndex ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return { value: parsed, monthPrecision: match[3] === undefined };
}

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function subtractUtcMonths(date: Date, months: number): Date {
  const targetMonth = date.getUTCMonth() - months;
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(date.getUTCFullYear(), targetMonth, Math.min(date.getUTCDate(), lastDay)),
  );
}

function formatExpiry(expiry: ParsedExpiry): string {
  return expiry.value.toLocaleDateString('en-GB', {
    month: 'short',
    year: 'numeric',
    ...(expiry.monthPrecision ? {} : { day: 'numeric' }),
    timeZone: 'UTC',
  });
}

export function buildMortgageExpiryNotification(
  mortgage: Mortgage,
  today = new Date(),
): MortgageNotificationItem | null {
  if (mortgage.rateType !== 'Fixed') return null;
  const expiry = parseFixedUntil(mortgage.fixedUntil);
  if (!expiry) return null;

  const comparisonToday = expiry.monthPrecision ? startOfUtcMonth(today) : startOfUtcDay(today);
  const actionWindowStart = subtractUtcMonths(expiry.value, ACTION_WINDOW_MONTHS);
  if (comparisonToday < actionWindowStart || comparisonToday > expiry.value) return null;

  const expiryLabel = formatExpiry(expiry);
  const eventVersion = `${mortgage.fixedUntil.trim()}:${mortgage.interestRate}`;
  return {
    id: `mortgage-expiry-${mortgage.id}-${eventVersion}`,
    kind: 'mortgage_expiry',
    status: 'reminder',
    mortgageId: mortgage.id,
    dismissalKey: `mortgage:${mortgage.id}:fixed-expiry:${eventVersion}`,
    updatedAt: actionWindowStart.toISOString(),
    timeLabel: expiryLabel,
    title: 'Fixed rate ending soon',
    body: `${mortgage.propertyAddress} · ${mortgage.interestRate}% fixed rate ends ${expiryLabel}`,
    unread: true,
    actionable: true,
    dismissible: true,
  };
}

export function buildMortgageExpiryNotifications(
  mortgages: Mortgage[],
  dismissedKeys: ReadonlySet<string>,
  today = new Date(),
): MortgageNotificationItem[] {
  const seen = new Set<string>();
  const notifications: MortgageNotificationItem[] = [];
  for (const mortgage of mortgages) {
    const notification = buildMortgageExpiryNotification(mortgage, today);
    if (
      notification === null ||
      dismissedKeys.has(notification.dismissalKey) ||
      seen.has(notification.dismissalKey)
    ) {
      continue;
    }
    seen.add(notification.dismissalKey);
    notifications.push(notification);
  }
  return notifications;
}

export function mortgageDismissalStorageKey(userId: number): string {
  return `quro:notification-dismissals:${userId}`;
}

export function parseDismissedNotificationKeys(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as unknown;
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === 'string')
        : [],
    );
  } catch {
    return new Set();
  }
}
