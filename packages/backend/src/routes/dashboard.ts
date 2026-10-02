import { Hono } from 'hono';
import { getAuthUser, getPartnerId } from '../lib/authUser';
import {
  buildDerivedAllocations,
  buildNetWorthHistory,
  loadNetWorthSourceData,
} from '../lib/netWorthHistory';
import { loadActivity } from '../lib/activity';

export { buildNetWorthHistory } from '../lib/netWorthHistory';
export { buildActivityList, getActivityCutoff } from '../lib/activity';

const app = new Hono();

app.get('/net-worth', async (c) => {
  const sourceData = await loadNetWorthSourceData(getAuthUser(c).id, getPartnerId(c));
  return c.json({ data: buildNetWorthHistory(sourceData) });
});

app.get('/allocations', async (c) => {
  const data = await buildDerivedAllocations(getAuthUser(c).id, getPartnerId(c));
  return c.json({ data });
});

app.get('/transactions', async (c) => {
  const data = await loadActivity(getAuthUser(c).id, getPartnerId(c));
  return c.json({ data });
});

export default app;
