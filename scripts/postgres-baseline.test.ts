import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

// PostgreSQL 18 is the only supported server (docs/install.md). The backend image must ship client
// tools of that major, or `pg_dump` stops with "server version mismatch" against the server. These
// checks keep the Compose database, the image's tools and every CI database on that major;
// packages/backend/src/lib/platformSupport.test.ts ties `quro migrate`'s version check to the same
// tools. CI also runs `pg_dump --version` inside the built image (docker-build job).

const ROOT = join(import.meta.dir, '..');
const SUPPORTED_MAJOR = 18;

async function read(path: string) {
  return Bun.file(join(ROOT, path)).text();
}

type ComposeFile = {
  services: Record<string, { image?: string; volumes?: string[] }>;
};

type CiFile = {
  jobs: Record<
    string,
    {
      strategy?: { matrix?: Record<string, unknown> };
      services?: { postgres?: { image?: string } };
    }
  >;
};

function majorOfImage(image: string | undefined) {
  const match = /^postgres:(\d+)[.-]/.exec(image ?? '');
  if (!match) throw new Error(`Not a pinned postgres image: ${image}`);
  return Number(match[1]);
}

async function composeDb() {
  const { services } = Bun.YAML.parse(await read('docker-compose.yml')) as ComposeFile;
  const db = services.db;
  if (!db) throw new Error('docker-compose.yml has no db service');
  return db;
}

describe('PostgreSQL baseline', () => {
  test('the backend image ships client tools of the Compose database major', async () => {
    const dockerfile = await read('packages/backend/Dockerfile');
    const toolsMajor = Number(/^ARG POSTGRES_CLIENT_MAJOR=(\d+)$/m.exec(dockerfile)?.[1]);
    expect(toolsMajor).toBe(majorOfImage((await composeDb()).image));
    expect(dockerfile).toContain('postgresql-client-${POSTGRES_CLIENT_MAJOR}');
  });

  test('the Compose database is on the supported major and uses its own data directory', async () => {
    const db = await composeDb();
    expect(majorOfImage(db.image)).toBe(SUPPORTED_MAJOR);
    const [data] = db.volumes ?? [];
    // 18 and later keep the cluster in a versioned directory below this mount point.
    expect(data).toEndWith(':/var/lib/postgresql');
    // Never ./data/postgres, which older checkouts wrote with another major.
    expect(data?.startsWith('./data/postgres:')).toBe(false);
  });

  test('every CI database runs the supported major, with no version matrix', async () => {
    const ci = Bun.YAML.parse(await read('.github/workflows/ci.yml')) as CiFile;
    const major = majorOfImage((await composeDb()).image);
    const withDatabase = Object.entries(ci.jobs).filter(([, job]) => job.services?.postgres);
    expect(withDatabase.map(([name]) => name)).toEqual(expect.arrayContaining(['smoke', 'test']));
    for (const [, job] of withDatabase) {
      expect(majorOfImage(job.services?.postgres?.image)).toBe(major);
      expect(job.strategy?.matrix).toBeUndefined();
    }
  });
});
