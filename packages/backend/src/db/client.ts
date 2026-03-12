import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import { getRuntimeDatabaseUrl } from './config';

export function createQueryClient(
  connectionString: string,
  options: Parameters<typeof postgres>[1] = {},
) {
  return postgres(connectionString, options);
}

export function createDb(connectionString: string, options: Parameters<typeof postgres>[1] = {}) {
  const queryClient = createQueryClient(connectionString, options);
  return {
    db: drizzle(queryClient, { schema }),
    queryClient,
  };
}

const { db } = createDb(getRuntimeDatabaseUrl());

export { db };
