import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { loadConfig, PROFILES, type Environment, type Profile } from './index';
import { featureManifest, retiredManifest, settingsManifest } from './manifest';
import { FEATURES, RETIRED_SETTINGS, SETTINGS, type SettingName } from './settings';

const ROOT = join(import.meta.dir, '../../../..');
const manifest = settingsManifest();
const names: string[] = manifest.map((entry) => entry.name);

function read(path: string) {
  return Bun.file(join(ROOT, path)).text();
}

const noFiles = (): never => {
  throw Object.assign(new Error('not found'), { code: 'ENOENT' });
};

describe('settings manifest', () => {
  test('lists every setting once, each with a description and a type', () => {
    expect(new Set(names).size).toBe(names.length);
    expect(names.sort()).toEqual(Object.keys(SETTINGS).sort());
    for (const entry of manifest) {
      expect(entry.description.length).toBeGreaterThan(10);
      expect(entry.type).not.toBe('');
    }
  });

  test('secret settings say whether the value or a file is secret', () => {
    for (const entry of manifest.filter((item) => item.secret === 'file')) {
      expect(entry.name.endsWith('_FILE')).toBe(true);
      expect(entry.default ?? '').toMatch(/^(\/run\/secrets\/|$)/);
    }
    for (const entry of manifest.filter((item) => item.secret === 'value')) {
      expect(entry.default).toBeNull();
    }
  });

  test('operator settings never default to a service name', () => {
    const defaults = manifest.filter((entry) => entry.audience === 'operator');
    for (const entry of defaults) {
      expect(entry.default ?? '').not.toMatch(
        /^(db|minio|backend|pension-parser)$|:\/\/(db|minio|backend|pension-parser)\b/,
      );
    }
  });

  test('retired settings never reappear as settings', () => {
    for (const retired of Object.keys(RETIRED_SETTINGS)) expect(names).not.toContain(retired);
    expect(retiredManifest().map((entry) => entry.name)).toEqual(Object.keys(RETIRED_SETTINGS));
    for (const replacement of Object.values(RETIRED_SETTINGS)) {
      for (const name of replacement.split(' and ')) expect(names).toContain(name);
    }
  });

  test('every feature names settings that exist', () => {
    for (const feature of featureManifest()) {
      for (const name of [...feature.enabledBy, ...feature.requires]) expect(names).toContain(name);
    }
  });
});

describe('what the manifest says is required matches what the loader enforces', () => {
  function problemSettings(profile: Profile, env: Environment) {
    const { problems } = loadConfig(env, noFiles);
    const sections = PROFILES[profile] as readonly (keyof typeof problems)[];
    return new Set(sections.flatMap((section) => problems[section].map((p) => p.setting)));
  }

  const alwaysRequired = manifest.filter((entry) => entry.required === 'yes').map((e) => e.name);

  test('an empty environment fails exactly on the settings marked required', () => {
    const failing = new Set<string>();
    for (const profile of Object.keys(PROFILES) as Profile[]) {
      for (const name of problemSettings(profile, {})) failing.add(name);
    }
    expect([...failing].sort()).toEqual([...alwaysRequired].sort());
  });

  test('a database URL replaces the settings marked as required unless a URL is used', () => {
    const urlOptional = manifest
      .filter((entry) => entry.requiredWhen?.includes('database URL'))
      .map((e) => e.name);
    expect(urlOptional.sort()).toEqual([...alwaysRequired].sort());
    for (const profile of Object.keys(PROFILES) as Profile[]) {
      expect(problemSettings(profile, { DATABASE_URL: 'postgres://u:p@h/db' }).size).toBe(0);
    }
  });

  test.each(Object.keys(FEATURES) as (keyof typeof FEATURES)[])(
    'setting one %s setting reports every other one the feature needs',
    (feature) => {
      const { enabledBy, requires } = FEATURES[feature];
      for (const name of enabledBy as readonly SettingName[]) {
        const env: Environment = {
          DATABASE_URL: 'postgres://u:p@h/db',
          // A syntactically valid value of the right kind for each setting.
          [name]: name.endsWith('_FILE') ? '/dev/null' : sampleValue(name),
        };
        const failing = problemSettings('server', env);
        for (const required of requires as readonly SettingName[]) {
          const satisfiedByThisOne = required === name || `${required}_FILE` === name;
          if (!satisfiedByThisOne) expect(failing).toContain(required);
        }
      }
    },
  );

  test('the manifest marks exactly the feature settings as required with a feature', () => {
    const featureRequired: string[] = manifest
      .filter((entry) => entry.required === 'feature')
      .map((e) => e.name);
    const declared = Object.values(FEATURES).flatMap(
      (feature) => feature.requires as readonly string[],
    );
    expect(featureRequired.sort()).toEqual(
      declared.filter((name, index) => declared.indexOf(name) === index).sort(),
    );
  });
});

function sampleValue(name: string): string {
  if (name.includes('URI') || name.includes('ENDPOINT') || name.includes('ORIGIN')) {
    return 'https://example.test/cb';
  }
  return 'sample';
}

describe('configuration documentation', () => {
  const sources = [
    '.env.example',
    'packages/backend/.env.example',
    'docs/install-contract.md',
    'docs/development.md',
    'docs/security.md',
    'docs/architecture.md',
    'docs/backup-and-restore.md',
    'docs/configuration.md',
    'README.md',
  ];

  test('every setting is mentioned in an example file or a doc', async () => {
    const corpus = (await Promise.all(sources.map((path) => read(path).catch(() => '')))).join(
      '\n',
    );
    const undocumented = names.filter((name) => !new RegExp(`\\b${name}\\b`).test(corpus));
    expect(undocumented).toEqual([]);
  });
});

describe('the Compose stack configures the backend with names the schema knows', () => {
  type Service = { environment?: Record<string, string> | string[] };
  const SERVICE_PROFILES: Record<string, Profile> = {
    backend: 'server',
    'pension-import-worker': 'worker',
    migrate: 'migrate',
    'db-tools': 'maintenance',
  };

  function environmentOf(service: Service): Record<string, string> {
    const { environment = {} } = service;
    if (!Array.isArray(environment)) return environment;
    return Object.fromEntries(
      environment.map((entry) => [
        entry.slice(0, entry.indexOf('=')),
        entry.slice(entry.indexOf('=') + 1),
      ]),
    );
  }

  // Compose substitutes `${NAME:-default}`; the defaults are what an unconfigured stack runs with.
  const withDefaults = (value: string) => value.replace(/\$\{[^}:]+(?::-([^}]*))?\}/g, '$1');

  test.each(Object.entries(SERVICE_PROFILES))('%s', async (serviceName, profile) => {
    const compose = Bun.YAML.parse(await read('docker-compose.yml')) as {
      services: Record<string, Service>;
    };
    const environment = Object.fromEntries(
      Object.entries(environmentOf(compose.services[serviceName])).map(([name, value]) => [
        name,
        withDefaults(String(value)),
      ]),
    );

    const unknown = Object.keys(environment).filter(
      (name) => !(name in SETTINGS) && !['NODE_ENV'].includes(name),
    );
    expect(unknown).toEqual([]);

    const mountedSecrets = new Set([
      '/run/secrets/postgres_admin_password',
      '/run/secrets/postgres_app_password',
      '/run/secrets/minio_app_secret_key',
    ]);
    const { problems } = loadConfig(environment, (path) => {
      if (mountedSecrets.has(path)) return 'secret\n';
      return noFiles();
    });
    const sections = PROFILES[profile] as readonly (keyof typeof problems)[];
    expect(sections.flatMap((section) => problems[section])).toEqual([]);
  });
});
