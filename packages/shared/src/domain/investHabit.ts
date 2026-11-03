import { getMonthAbbreviationIndex, MONTH_ABBREVIATIONS } from '../types/index.js';
import type { CurrencyCode } from '../types/index.js';
import { fromCents, toCents } from '../utils/money.js';
import { holdingValue } from './holdings.js';

/** A calendar month: its year and its month index (0 is January). */
export type GoalMonth = { year: number; month: number };

/** The buys of one month in one currency: shares × price of each buy, summed in cents. */
export type InvestHabitBuyTotal = {
  /** `YYYY-MM`. */
  month: string;
  currency: CurrencyCode;
  amount: number;
};

/** A buy as the ledger stores it, with the currency of its holding. */
export type InvestHabitBuy = {
  date: string;
  currency: CurrencyCode;
  shares?: unknown;
  price?: unknown;
};

/** The fields of a goal that set an invest habit's months. */
export type InvestHabitRangeFields = {
  startMonth?: string | null;
  deadline?: string | null;
  year?: number | null;
  totalMonths?: number | null;
};

const MONTHS_PER_YEAR = 12;
const MONTH_KEY_LENGTH = 'YYYY-MM'.length;
const MONTH_DIGITS = 'MM'.length;
const LABEL_PATTERN = /^(?<name>[A-Za-z]{3})\s+(?<year>\d{4})$/;
const KEY_PATTERN = /^(?<year>\d{4})-(?<month>\d{2})$/;

function readMonth(text: string): { year: string; month: number } | null {
  const label = LABEL_PATTERN.exec(text)?.groups;
  if (label) return { year: label.year!, month: getMonthAbbreviationIndex(label.name!) };
  const key = KEY_PATTERN.exec(text)?.groups;
  return key ? { year: key.year!, month: Number(key.month) - 1 } : null;
}

/** Reads "Oct 2026", as the goal forms write a month, or the month key "2026-10". */
export function parseGoalMonth(value: string | null | undefined): GoalMonth | null {
  const read = readMonth(value?.trim() ?? '');
  if (!read || read.month < 0 || read.month >= MONTHS_PER_YEAR) return null;
  return { year: Number(read.year), month: read.month };
}

/** "Oct 2026". */
export function formatGoalMonth(value: GoalMonth): string {
  return `${MONTH_ABBREVIATIONS[value.month]} ${value.year}`;
}

/** "2026-10": the month key, the start of a `YYYY-MM-DD` date in that month. */
export function goalMonthKey(value: GoalMonth): string {
  return `${value.year}-${String(value.month + 1).padStart(MONTH_DIGITS, '0')}`;
}

/** The month key of a `YYYY-MM-DD` date. */
export function monthKeyOfDate(date: string): string {
  return date.slice(0, MONTH_KEY_LENGTH);
}

/** The month after this one. */
export function nextGoalMonth(value: GoalMonth): GoalMonth {
  const index = monthIndex(value) + 1;
  return { year: Math.floor(index / MONTHS_PER_YEAR), month: index % MONTHS_PER_YEAR };
}

function monthIndex(value: GoalMonth): number {
  return value.year * MONTHS_PER_YEAR + value.month;
}

/** Months from start to end, both included; 0 when the start is after the end. */
export function countGoalMonths(start: GoalMonth, end: GoalMonth): number {
  return Math.max(0, monthIndex(end) - monthIndex(start) + 1);
}

/** Every month from start to end, both included; empty when the start is after the end. */
export function goalMonthRange(start: GoalMonth, end: GoalMonth): GoalMonth[] {
  const months: GoalMonth[] = [];
  for (let index = monthIndex(start); index <= monthIndex(end); index += 1) {
    months.push({ year: Math.floor(index / MONTHS_PER_YEAR), month: index % MONTHS_PER_YEAR });
  }
  return months;
}

/** The start and end months of a goal with a start month, or null when it has none or they do not parse. */
export function goalStartEndMonths(
  goal: Pick<InvestHabitRangeFields, 'startMonth' | 'deadline'>,
): { start: GoalMonth; end: GoalMonth } | null {
  const start = parseGoalMonth(goal.startMonth);
  const end = parseGoalMonth(goal.deadline);
  if (!start || !end || countGoalMonths(start, end) === 0) return null;
  return { start, end };
}

/**
 * The months an invest habit tracks: from its start month to its deadline. A habit saved without
 * a start month keeps the months it always showed: its total months from January of its year.
 */
export function investHabitMonths(goal: InvestHabitRangeFields, fallbackYear: number): GoalMonth[] {
  const range = goalStartEndMonths(goal);
  if (range) return goalMonthRange(range.start, range.end);
  const year = goal.year ?? parseGoalMonth(goal.deadline)?.year ?? fallbackYear;
  const count = Math.min(Math.max(goal.totalMonths ?? MONTHS_PER_YEAR, 1), MONTHS_PER_YEAR);
  return goalMonthRange({ year, month: 0 }, { year, month: count - 1 });
}

/**
 * Totals buys per month and currency: each buy is worth shares × price in its holding's currency
 * (rounded to cents once), and a month's buys add up in cents. Sorted by month, then currency.
 */
export function sumInvestHabitBuys(buys: Iterable<InvestHabitBuy>): InvestHabitBuyTotal[] {
  const cents = new Map<string, { month: string; currency: CurrencyCode; cents: number }>();
  for (const buy of buys) {
    const month = monthKeyOfDate(buy.date);
    if (!KEY_PATTERN.test(month)) continue;
    const key = `${month}|${buy.currency}`;
    const entry = cents.get(key) ?? { month, currency: buy.currency, cents: 0 };
    entry.cents += toCents(holdingValue(Number(buy.shares ?? 0), Number(buy.price ?? 0)));
    cents.set(key, entry);
  }
  return [...cents.values()]
    .sort((a, b) => a.month.localeCompare(b.month) || a.currency.localeCompare(b.currency))
    .map((entry) => ({
      month: entry.month,
      currency: entry.currency,
      amount: fromCents(entry.cents),
    }));
}
