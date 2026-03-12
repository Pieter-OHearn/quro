import { createQueryClient } from './client';
import { getBootstrapDatabaseUrl, redactDatabaseUrl } from './config';
import { ensureRuntimeRole, getRuntimeRoleConfigFromEnv } from './runtimeRole';

async function main() {
  const config = getRuntimeRoleConfigFromEnv();
  if (!config) {
    console.log(
      'Skipping runtime-role bootstrap because APP_DATABASE_URL or APP_DB_USER/APP_DB_PASSWORD are not configured.',
    );
    return;
  }

  const connectionString = getBootstrapDatabaseUrl();
  console.log(`Bootstrapping runtime role via ${redactDatabaseUrl(connectionString)}`);

  const sql = createQueryClient(connectionString, { max: 1 });
  try {
    await ensureRuntimeRole(sql, config);
    console.log(`Runtime role ready: ${config.roleName}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
