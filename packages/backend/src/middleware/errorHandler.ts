import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { HTTP_STATUS } from '../constants/http';
import { CurrencyRatesUnavailableError } from '../lib/currencyRateCache';
import { errorFields, log } from '../lib/logger';
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
    log.warn('request.value_refused', { errorCode: findDataExceptionCode(err) });
    return c.json({ error: 'A value in the request cannot be stored' }, HTTP_STATUS.BAD_REQUEST);
  }
  // The message and stack stay out of the log: a failed statement's message repeats the SQL and
  // the values it carried. The class and codes, with the request id, are enough to find the route.
  log.error('request.failed', errorFields(err));
  return c.json({ error: 'Internal server error' }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
};
