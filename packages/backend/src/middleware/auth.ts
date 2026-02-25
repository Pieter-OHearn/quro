import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { db } from "../db/client";
import { sessions, users } from "../db/schema";
import { eq } from "drizzle-orm";

export const requireAuth = createMiddleware(async (c, next) => {
  const sessionId = getCookie(c, "session");
  if (!sessionId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (!session || session.expiresAt < new Date()) {
    return c.json({ error: "Session expired" }, 401);
  }

  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, session.userId));

  if (!user) {
    return c.json({ error: "User not found" }, 401);
  }

  c.set("user", user);
  await next();
});
