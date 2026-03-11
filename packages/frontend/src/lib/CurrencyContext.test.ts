/// <reference types="bun-types" />

import { expect, test } from 'bun:test';
import { getCurrencyRatesFailureMode } from './CurrencyContext';
import { CurrencyRatesUnavailableError } from './useCurrencyRates';

test('uses the FX fallback only for genuine currency-rate availability errors', () => {
  expect(
    getCurrencyRatesFailureMode(
      new CurrencyRatesUnavailableError('Missing server-backed FX rates for: CHF'),
    ),
  ).toBe('fx-unavailable');
});

test('routes backend and transport failures to the standard app error screen', () => {
  expect(getCurrencyRatesFailureMode(new Error('Network Error'))).toBe('app-error');
  expect(getCurrencyRatesFailureMode({ message: 'HTTP 503' })).toBe('app-error');
});
