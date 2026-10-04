import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { sessions, users } from '../db/schema';
import { createIntegrationHelpers, type AuthSession } from '../test/integration';

const integration = createIntegrationHelpers('edge-hardening.integration.quro.test');
const MALFORMED_JSON = '{not json';

beforeAll(async () => {
  await integration.cleanup();
});

afterAll(async () => {
  await integration.cleanup();
});

describe('malformed JSON bodies', () => {
  let owner: AuthSession;

  beforeAll(async () => {
    owner = await integration.signUp('malformed-json');
  });

  test.each([
    ['POST', '/api/auth/signup'],
    ['POST', '/api/auth/signin'],
    ['PUT', '/api/settings/profile'],
    ['PUT', '/api/settings/preferences'],
    ['PUT', '/api/settings/password'],
    ['POST', '/api/partner/invite'],
  ])('%s %s returns 400 instead of 500', async (method, path) => {
    const response = await integration.request(path, {
      method,
      cookie: owner.cookie,
      body: MALFORMED_JSON,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid request body' });
  });

  test('a JSON array body is rejected the same way', async () => {
    const response = await integration.request('/api/auth/signin', {
      method: 'POST',
      json: ['a@example.com'],
    });
    expect(response.status).toBe(400);
  });
});

describe('session lifecycle', () => {
  test('deleting a user removes their sessions', async () => {
    const owner = await integration.signUp('session-cascade');
    const before = await db.select().from(sessions).where(eq(sessions.userId, owner.user.id));
    expect(before.length).toBeGreaterThan(0);

    await db.delete(users).where(eq(users.id, owner.user.id));

    const after = await db.select().from(sessions).where(eq(sessions.userId, owner.user.id));
    expect(after).toHaveLength(0);
  });
});
