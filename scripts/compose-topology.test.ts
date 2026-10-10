import { describe, expect, test } from 'bun:test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

// The deployment modes in docs/security.md assume browsers reach the backend only through the
// bundled nginx, and that the Compose defaults give mode A. These checks keep the Compose files
// from drifting away from those assumptions.

type Service = {
  image?: string;
  volumes?: unknown[];
  ports?: unknown[];
  networks?: string[] | Record<string, unknown>;
  environment?: string[] | Record<string, string>;
};
type ComposeFile = { services: Record<string, Service> };

const ROOT = join(import.meta.dir, '..');

async function readCompose(path: string): Promise<ComposeFile> {
  return Bun.YAML.parse(await Bun.file(join(ROOT, path)).text()) as ComposeFile;
}

function environmentOf(service: Service): Record<string, string> {
  const { environment = {} } = service;
  if (!Array.isArray(environment)) return environment;
  return Object.fromEntries(
    environment.map((entry) => {
      const separator = entry.indexOf('=');
      return [entry.slice(0, separator), entry.slice(separator + 1)];
    }),
  );
}

function networksOf(service: Service): string[] {
  const { networks = [] } = service;
  return Array.isArray(networks) ? networks : Object.keys(networks);
}

const COMPOSE_FILES = ['docker-compose.yml'];

describe('Compose topology', () => {
  test.each(COMPOSE_FILES)('%s publishes nginx and never the backend', async (path) => {
    const { services } = await readCompose(path);
    expect(services.frontend?.ports?.length).toBeGreaterThan(0);
    expect(services.backend?.ports).toBeUndefined();
  });

  test('no Compose file mounts the Docker socket or runs an updater', async () => {
    const files = readdirSync(ROOT).filter((name) => /^docker-compose.*\.ya?ml$/.test(name));
    expect(files).toContain('docker-compose.yml');
    for (const file of files) {
      for (const [name, service] of Object.entries((await readCompose(file)).services)) {
        expect(JSON.stringify(service.volumes ?? [])).not.toContain('docker.sock');
        expect(`${name} ${service.image ?? ''}`).not.toMatch(/updater/i);
      }
    }
  });

  test('the development overlay does not publish the backend either', async () => {
    const { services } = await readCompose('docker-compose.development.yml');
    expect(services.backend?.ports).toBeUndefined();
  });

  test('only nginx and the backend share the frontend network', async () => {
    const { services } = await readCompose('docker-compose.yml');
    const onFrontendNet = Object.entries(services)
      .filter(([, service]) => networksOf(service).includes('frontend-net'))
      .map(([name]) => name)
      .sort();
    expect(onFrontendNet).toEqual(['backend', 'frontend']);
  });

  test.each(COMPOSE_FILES)('%s defaults to mode A with invite-only registration', async (path) => {
    const env = environmentOf((await readCompose(path)).services.backend!);
    expect(env.SECURE_COOKIES).toBe('${SECURE_COOKIES:-false}');
    expect(env.QRO_REGISTRATION_MODE).toBe('${QRO_REGISTRATION_MODE:-invite}');
    // Docker's default network range: the bundled nginx, not LAN clients in 10/8 or 192.168/16.
    expect(env.TRUSTED_PROXIES).toBe('${TRUSTED_PROXIES:-172.16.0.0/12}');
  });

  test('documents are stored on the filesystem with no object storage service', async () => {
    const files = readdirSync(ROOT).filter((name) => /^docker-compose.*\.ya?ml$/.test(name));
    for (const file of files) {
      const text = await Bun.file(join(ROOT, file)).text();
      expect(text).not.toMatch(/minio/i);
    }

    const { services } = await readCompose('docker-compose.yml');
    for (const name of ['backend', 'pension-import-worker']) {
      expect(services[name]?.volumes).toContain('./data/documents:/var/lib/quro/documents');
      // Unset means filesystem; an old .env with S3 settings then stops the backend (exit 2).
      expect(environmentOf(services[name]!).QRO_DOCUMENT_STORAGE).toBe('${QRO_DOCUMENT_STORAGE:-}');
    }
    // `quro backup` reads the documents and `quro restore` writes them back; archives go to
    // ./backups, the default QRO_BACKUP_DIR inside the container.
    expect(services['db-tools']?.volumes).toContain('./data/documents:/var/lib/quro/documents');
    expect(services['db-tools']?.volumes).toContain('./backups:/var/lib/quro/backups');
  });
});
