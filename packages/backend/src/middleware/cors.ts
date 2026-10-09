import { cors } from 'hono/cors';
import { DEFAULT_CORS_ORIGINS, getConfig } from '../config';

export { DEFAULT_CORS_ORIGINS };

// The origins are parsed and validated with the rest of the configuration (CORS_ORIGIN).
export function resolveCorsOrigin(origins: readonly string[]): string | string[] {
  return origins.length === 1 ? origins[0] : [...origins];
}

export function createCorsMiddleware(origins: readonly string[] = getConfig().web.corsOrigins) {
  // Same-origin Docker traffic is proxied by nginx and does not need CORS, but
  // direct backend access in split-origin local dev still does.
  return cors({
    origin: resolveCorsOrigin(origins),
    credentials: true,
  });
}

export const corsMiddleware = createCorsMiddleware();
