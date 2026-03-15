import { cors } from 'hono/cors';

export const DEFAULT_CORS_ORIGINS = ['http://localhost', 'http://localhost:5173'] as const;

export function resolveCorsOrigin(rawOrigins = process.env.CORS_ORIGIN): string | string[] {
  const origins = rawOrigins
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (!origins?.length) return [...DEFAULT_CORS_ORIGINS];
  if (origins.includes('*')) {
    console.warn(
      '[CORS] Wildcard origin is not allowed with credentials. Falling back to defaults.',
    );
    return [...DEFAULT_CORS_ORIGINS];
  }
  return origins.length === 1 ? origins[0] : origins;
}

export function createCorsMiddleware(rawOrigins = process.env.CORS_ORIGIN) {
  // Same-origin Docker traffic is proxied by nginx and does not need CORS, but
  // direct backend access in split-origin local dev still does.
  return cors({
    origin: resolveCorsOrigin(rawOrigins),
    credentials: true,
  });
}

export const corsMiddleware = createCorsMiddleware();
