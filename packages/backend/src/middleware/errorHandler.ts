import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { HTTP_STATUS } from '../constants/http';
import { CurrencyRatesUnavailableError } from '../lib/currencyRateCache';

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  if (err instanceof CurrencyRatesUnavailableError) {
    return c.json({ error: err.message }, HTTP_STATUS.SERVICE_UNAVAILABLE);
  }
  console.error(`[Error] ${err.message}`, err);
  return c.json({ error: 'Internal server error' }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
};
