import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';

// The deployment modes in docs/security.md assume browsers reach the backend only through the
// bundled nginx, and that the Compose defaults give mode A. These checks keep the Compose files
// from drifting away from those assumptions.

type Service = {
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

const COMPOSE_FILES = ['docker-compose.yml', 'deploy/docker-compose.release.template.yml'];

describe('Compose topology', () => {
  test.each(COMPOSE_FILES)('%s publishes nginx and never the backend', async (path) => {
    const { services } = await readCompose(path);
    expect(services.frontend?.ports?.length).toBeGreaterThan(0);
    expect(services.backend?.ports).toBeUndefined();
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
    expect(env.REGISTRATION_MODE).toBe('${REGISTRATION_MODE:-invite}');
    // Docker's default network range: the bundled nginx, not LAN clients in 10/8 or 192.168/16.
    expect(env.TRUSTED_PROXIES).toBe('${TRUSTED_PROXIES:-172.16.0.0/12}');
  });
});
