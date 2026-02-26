import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { db } from '../db/client';
import { users, sessions } from '../db/schema';
import { eq } from 'drizzle-orm';

const app = new Hono();

function generateSessionId() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

// ── Sign Up ─────────────────────────────────────────────────────────────────

app.post('/signup', async (c) => {
  const { name, email, password } = await c.req.json();

  if (!name?.trim() || !email?.trim() || !password) {
    return c.json({ error: 'Name, email, and password are required' }, 400);
  }
  if (password.length < 8) {
    return c.json({ error: 'Password must be at least 8 characters' }, 400);
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()));
  if (existing.length > 0) {
    return c.json({ error: 'An account with this email already exists' }, 409);
  }

  const passwordHash = await Bun.password.hash(password, { algorithm: 'bcrypt', cost: 10 });

  const [user] = await db
    .insert(users)
    .values({ name: name.trim(), email: email.toLowerCase().trim(), passwordHash })
    .returning({ id: users.id, name: users.name, email: users.email, createdAt: users.createdAt });

  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE);
  await db.insert(sessions).values({ id: sessionId, userId: user.id, expiresAt });

  setCookie(c, 'session', sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_MAX_AGE / 1000,
  });

  return c.json({ data: user }, 201);
});

// ── Sign In ─────────────────────────────────────────────────────────────────

app.post('/signin', async (c) => {
  const { email, password } = await c.req.json();

  if (!email?.trim() || !password) {
    return c.json({ error: 'Email and password are required' }, 400);
  }

  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
  if (!user) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  const valid = await Bun.password.verify(password, user.passwordHash);
  if (!valid) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE);
  await db.insert(sessions).values({ id: sessionId, userId: user.id, expiresAt });

  setCookie(c, 'session', sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_MAX_AGE / 1000,
  });

  return c.json({
    data: { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt },
  });
});

// ── Get current user ────────────────────────────────────────────────────────

app.get('/me', async (c) => {
  const sessionId = getCookie(c, 'session');
  if (!sessionId) {
    return c.json({ data: null });
  }

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session || session.expiresAt < new Date()) {
    deleteCookie(c, 'session', { path: '/' });
    return c.json({ data: null });
  }

  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, session.userId));

  if (!user) {
    return c.json({ data: null });
  }

  return c.json({ data: user });
});

// ── Sign Out ────────────────────────────────────────────────────────────────

app.post('/signout', async (c) => {
  const sessionId = getCookie(c, 'session');
  if (sessionId) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    deleteCookie(c, 'session', { path: '/' });
  }
  return c.json({ ok: true });
});

export default app;
