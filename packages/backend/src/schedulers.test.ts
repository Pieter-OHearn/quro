import { describe, expect, test } from 'bun:test';
import { loadConfig, type Environment } from './config';
import { activeSchedulers, SCHEDULERS, startSchedulers, type SchedulerEntry } from './schedulers';

const BASE: Environment = { DATABASE_URL: 'postgres://u:p@h/db' };
const BUNQ: Environment = {
  BUNQ_CLIENT_ID: 'id',
  BUNQ_CLIENT_SECRET: 'secret',
  BUNQ_REDIRECT_URI: 'https://quro.example/api/bunq/oauth/callback',
  FRONTEND_ORIGIN: 'https://quro.example',
};

const names = (entries: readonly SchedulerEntry[]) => entries.map((entry) => entry.name);

function configFor(env: Environment) {
  return loadConfig({ ...BASE, ...env }).config;
}

describe('activeSchedulers', () => {
  test('the bunq sync runs only when bunq is configured', () => {
    expect(names(activeSchedulers(configFor({})))).not.toContain('bunq-sync');
    expect(names(activeSchedulers(configFor(BUNQ)))).toContain('bunq-sync');
  });

  test('the core schedulers always run', () => {
    const core = SCHEDULERS.filter((entry) => !entry.capability).map((entry) => entry.name);
    expect(names(activeSchedulers(configFor({})))).toEqual(core);
  });
});

describe('startSchedulers', () => {
  function run(env: Environment) {
    const started: string[] = [];
    const entries = SCHEDULERS.map((entry) => ({
      ...entry,
      start: () => started.push(entry.name),
    }));
    startSchedulers(configFor(env), entries);
    return started;
  }

  test('QRO_DISABLE_SCHEDULERS starts none', () => {
    expect(run({ ...BUNQ, QRO_DISABLE_SCHEDULERS: 'true' })).toEqual([]);
  });

  test('starts the configured set', () => {
    const started = run({});
    expect(started).toContain('session-cleanup');
    expect(started).not.toContain('bunq-sync');
    expect(run(BUNQ)).toContain('bunq-sync');
  });

  test('is inert under test so importing the app never leaves timers running', () => {
    expect(run({ NODE_ENV: 'test', ...BUNQ })).toEqual([]);
  });
});
