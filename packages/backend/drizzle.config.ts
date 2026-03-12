import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.ADMIN_DATABASE_URL ||
      process.env.DATABASE_URL ||
      'postgres://quro:quro@127.0.0.1:5432/quro',
  },
});
