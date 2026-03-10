import { Hono } from 'hono';
import { db } from '../db/client';
import { currencyRates } from '../db/schema';
import { asc, eq } from 'drizzle-orm';
import { HTTP_STATUS } from '../constants/http';

const app = new Hono();

app.get('/rates', async (c) => {
  const data = await db
    .select({
      id: currencyRates.id,
      fromCurrency: currencyRates.fromCurrency,
      toCurrency: currencyRates.toCurrency,
      rate: currencyRates.rate,
      updatedAt: currencyRates.updatedAt,
    })
    .from(currencyRates)
    .orderBy(asc(currencyRates.fromCurrency), asc(currencyRates.toCurrency));

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
