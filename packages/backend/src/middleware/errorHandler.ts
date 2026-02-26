import type { ErrorHandler } from 'hono';
import { HTTP_STATUS } from '../constants/http';

export const errorHandler: ErrorHandler = (err, c) => {
  console.error(`[Error] ${err.message}`);
  return c.json({ error: err.message || 'Internal server error' }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
};
