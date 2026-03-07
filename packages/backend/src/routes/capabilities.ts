import { Hono } from 'hono';
import { getAuthUser } from '../lib/authUser';
import { getAppCapabilities } from '../lib/capabilities';

const app = new Hono();

app.get('/', async (c) => {
  getAuthUser(c);
  const capabilities = await getAppCapabilities();
  return c.json({ data: capabilities });
});

export default app;
