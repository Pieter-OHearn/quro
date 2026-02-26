import { Hono } from 'hono';
import { db } from '../db/client';
import { currencyRates } from '../db/schema';
import { eq } from 'drizzle-orm';
import { HTTP_STATUS } from '../constants/http';

const app = new Hono();

app.get('/rates', async (c) => {
  const data = await db.select().from(currencyRates);
  return c.json({ data });
});

app.patch('/rates/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json();
  const [data] = await db
    .update(currencyRates)
    .set(body)
    .where(eq(currencyRates.id, id))
    .returning();
  if (!data) return c.json({ error: 'Currency rate not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

export default app;
