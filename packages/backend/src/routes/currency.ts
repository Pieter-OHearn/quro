import { Hono } from 'hono';
import { getCurrentCurrencyRateRows } from '../lib/currencyRateSync';

const app = new Hono();

app.get('/rates', async (c) => {
  const data = await getCurrentCurrencyRateRows();
  return c.json({ data });
});

export default app;
