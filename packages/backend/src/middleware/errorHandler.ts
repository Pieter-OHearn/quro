import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { HTTP_STATUS } from '../constants/http';
import { CurrencyRatesUnavailableError } from '../lib/currencyRateCache';
import { findDataExceptionCode, isDataException } from '../lib/postgresErrors';

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  if (err instanceof CurrencyRatesUnavailableError) {
    return c.json({ error: err.message }, HTTP_STATUS.SERVICE_UNAVAILABLE);
  }
  if (isDataException(err)) {
    // The statement and its values stay out of the log too; the code is enough to find a route
    // that lets a bad value through.
    console.warn(
      `[Warn] the database refused a value in a request (${findDataExceptionCode(err)})`,
    );
    return c.json({ error: 'A value in the request cannot be stored' }, HTTP_STATUS.BAD_REQUEST);
  }
  console.error(`[Error] ${err.message}`, err);
  return c.json({ error: 'Internal server error' }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
};
