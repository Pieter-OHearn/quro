import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import { getRuntimeDatabaseUrl } from './config';
import { instrumentPostgres, startTracing } from '../lib/tracing';

export function createQueryClient(
  connectionString: string,
  options: Parameters<typeof postgres>[1] = {},
) {
  return postgres(connectionString, options);
}

export function createDb(connectionString: string, options: Parameters<typeof postgres>[1] = {}) {
  const queryClient = createQueryClient(connectionString, options);
  // With tracing on, every query gets a client span (see lib/tracing.ts).
  const tracedClient = startTracing() ? instrumentPostgres(queryClient) : queryClient;
  return {
    db: drizzle(tracedClient, { schema }),
    queryClient,
  };
}

const { db } = createDb(getRuntimeDatabaseUrl());

export { db };
