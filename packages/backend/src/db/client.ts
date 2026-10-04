import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import { getRuntimeDatabaseUrl } from './config';
import { instrumentPostgres, startTracing } from '../lib/tracing';
import { deadlinePostgres } from '../lib/deadlinePostgres';

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
    db: drizzle(deadlinePostgres(tracedClient, true), { schema }),
    queryClient,
  };
}

const { db, queryClient } = createDb(getRuntimeDatabaseUrl());

// A separate pool that `db` routes to inside a work scope. Drizzle installs passthrough
// date/time parsers on the client it wraps, so copy them; postgres-js defaults would
// parse `timestamp` columns in the process time zone.
export function createScopedQueryClient(options: Parameters<typeof postgres>[1] = {}) {
  const client = createQueryClient(getRuntimeDatabaseUrl(), options);
  Object.assign(client.options.parsers, queryClient.options.parsers);
  Object.assign(client.options.serializers, queryClient.options.serializers);
  return client;
}

export { db, queryClient };

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbExecutor = typeof db | DbTransaction;
