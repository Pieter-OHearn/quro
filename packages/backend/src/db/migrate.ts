import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const connectionString = process.env.DATABASE_URL || "postgres://quro:quro@127.0.0.1:5432/quro";
const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(here, "migrations");

const sleep = (ms: number) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

const isRetryableDbError = (error: unknown): boolean => {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  return code === "57P03" || code === "ECONNREFUSED";
};

const maxAttempts = 30;
for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  const migrationClient = postgres(connectionString, { max: 1 });
  try {
    const db = drizzle(migrationClient);
    await migrate(db, { migrationsFolder });
    console.log("Migrations complete");
    await migrationClient.end();
    process.exit(0);
  } catch (error) {
    await migrationClient.end();
    if (!isRetryableDbError(error) || attempt === maxAttempts) {
      throw error;
    }
    await sleep(1000);
  }
}
