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
    // Backups read the documents; they never write to them.
    expect(services['db-tools']?.volumes).toContain('./data/documents:/var/lib/quro/documents:ro');
  });
});

// docs/compose.example.yaml is the file operators copy. The clean-install test
// (scripts/clean-install/run.sh) starts it; these checks keep its shape.
describe('the example Compose file', () => {
  const example = () => readCompose('docs/compose.example.yaml');

  test('publishes only nginx, mounts no Docker socket and has no object storage service', async () => {
    const { services } = await example();
    const published = Object.entries(services)
      .filter(([, service]) => (service.ports ?? []).length > 0)
      .map(([name]) => name);
    expect(published).toEqual(['frontend']);
    for (const [name, service] of Object.entries(services)) {
      expect(JSON.stringify(service.volumes ?? [])).not.toContain('docker.sock');
      expect(`${name} ${service.image ?? ''}`).not.toMatch(/minio|updater/i);
    }
  });

  test('pins one release of both Quro images and the baseline PostgreSQL', async () => {
    const { services } = await example();
    const quroTags = Object.values(services)
      .map((service) => service.image ?? '')
      .filter((image) => image.startsWith('ghcr.io/pieter-ohearn/quro-'))
      .map((image) => image.split(':')[1]);
    expect(quroTags.length).toBe(3);
    expect(new Set(quroTags).size).toBe(1);
    expect(quroTags[0]).toMatch(/^v\d+\.\d+\.\d+(-rc\.\d+)?$/);
    expect(services.db?.image).toBe((await readCompose('docker-compose.yml')).services.db?.image);
  });

  test('wires the backend to its settings, secrets, documents and health check', async () => {
    const { services } = await example();
    const backend = services.backend as Service & {
      command?: string[];
      healthcheck?: { test: string[] };
      env_file?: string;
    };
    expect(backend.command).toBeUndefined(); // the image's default command is `serve`
    expect(backend.healthcheck?.test).toEqual(['CMD', 'quro', 'health']);
    expect(backend.env_file).toBe('./config/quro.env');
    expect(backend.volumes).toContain('./data/documents:/var/lib/quro/documents');
    expect((services.migrate as Service & { command?: string[] }).command).toEqual(['migrate']);
    expect(environmentOf(services.frontend!).QRO_API_URL).toBe('http://backend:3000');
    expect(
      environmentOf((await readCompose('docker-compose.yml')).services.frontend!).QRO_API_URL,
    ).toBe('http://backend:3000');
  });
});
