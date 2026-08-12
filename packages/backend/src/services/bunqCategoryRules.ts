import type { ExpenseClass } from '@quro/shared';

export const UNCATEGORISED_NAME = 'Uncategorised';

type CategoryPreset = { emoji: string; color: string; expenseClass: ExpenseClass };

export const CATEGORY_PRESETS: Record<string, CategoryPreset> = {
  Groceries: { emoji: '🛒', color: '#22c55e', expenseClass: 'essential' },
  'Restaurants & Bars': { emoji: '🍽️', color: '#f97316', expenseClass: 'discretionary' },
  Transport: { emoji: '🚌', color: '#3b82f6', expenseClass: 'essential' },
  Fuel: { emoji: '⛽', color: '#ef4444', expenseClass: 'essential' },
  Shopping: { emoji: '🛍️', color: '#a855f7', expenseClass: 'discretionary' },
  Subscriptions: { emoji: '📱', color: '#6366f1', expenseClass: 'discretionary' },
  Entertainment: { emoji: '🎬', color: '#ec4899', expenseClass: 'discretionary' },
  Health: { emoji: '💊', color: '#14b8a6', expenseClass: 'essential' },
  Utilities: { emoji: '💡', color: '#eab308', expenseClass: 'essential' },
  'Personal Care': { emoji: '✂️', color: '#f43f5e', expenseClass: 'discretionary' },
  Travel: { emoji: '✈️', color: '#0ea5e9', expenseClass: 'discretionary' },
  [UNCATEGORISED_NAME]: { emoji: '📦', color: '#94a3b8', expenseClass: 'essential' },
};

export const DEFAULT_CATEGORY_PRESET: CategoryPreset = CATEGORY_PRESETS[UNCATEGORISED_NAME];

export const MCC_DEFAULTS: Record<string, string> = {
  '5411': 'Groceries',
  '5412': 'Groceries',
  '5499': 'Groceries',
  '5811': 'Restaurants & Bars',
  '5812': 'Restaurants & Bars',
  '5813': 'Restaurants & Bars',
  '5814': 'Restaurants & Bars',
  '5921': 'Restaurants & Bars',
  '4111': 'Transport',
  '4121': 'Transport',
  '4131': 'Transport',
  '4511': 'Transport',
  '5541': 'Fuel',
  '5542': 'Fuel',
  '5651': 'Shopping',
  '5661': 'Shopping',
  '5691': 'Shopping',
  '5732': 'Shopping',
  '5942': 'Shopping',
  '5995': 'Shopping',
  '4814': 'Subscriptions',
  '5734': 'Subscriptions',
  '7372': 'Subscriptions',
  '7841': 'Subscriptions',
  '7832': 'Entertainment',
  '7922': 'Entertainment',
  '7941': 'Entertainment',
  '7991': 'Entertainment',
  '5912': 'Health',
  '8011': 'Health',
  '8021': 'Health',
  '8043': 'Health',
  '8062': 'Health',
  '4900': 'Utilities',
  '7230': 'Personal Care',
  '5977': 'Personal Care',
  '7011': 'Travel',
  '4722': 'Travel',
};
