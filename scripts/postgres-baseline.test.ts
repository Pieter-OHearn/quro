import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

// PostgreSQL 18 is the 1.0 baseline and 16 stays a supported server (DECISIONS D12). The backend
// image must ship client tools of the baseline major, or `pg_dump` stops with "server version
// mismatch" against a baseline server. These checks keep the Compose database, the image's
// tools and the CI matrix pointing at the same majors. CI also runs `pg_dump --version` inside
// the built image (docker-build job).

const ROOT = join(import.meta.dir, '..');

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
      strategy?: { matrix?: { postgres?: string[] } };
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

  test('the Compose database is on the baseline major and uses a new data directory', async () => {
    const db = await composeDb();
    expect(majorOfImage(db.image)).toBeGreaterThanOrEqual(18);
    const [data] = db.volumes ?? [];
    // 18 and later keep the cluster in a versioned directory below this mount point.
    expect(data).toEndWith(':/var/lib/postgresql');
    // Never the directory earlier releases wrote with 16 or 17.
    expect(data?.startsWith('./data/postgres:')).toBe(false);
  });

  test('CI runs the suite on 16 and on the baseline major', async () => {
    const ci = Bun.YAML.parse(await read('.github/workflows/ci.yml')) as CiFile;
    const baseline = String(majorOfImage((await composeDb()).image));
    expect(ci.jobs.test?.strategy?.matrix?.postgres).toEqual(['16', baseline]);
    expect(ci.jobs.test?.services?.postgres?.image).toBe('postgres:${{ matrix.postgres }}-alpine');
  });

  test('the browser smoke run uses the baseline major', async () => {
    const ci = Bun.YAML.parse(await read('.github/workflows/ci.yml')) as CiFile;
    const baseline = majorOfImage((await composeDb()).image);
    expect(majorOfImage(ci.jobs.smoke?.services?.postgres?.image)).toBe(baseline);
  });
});
