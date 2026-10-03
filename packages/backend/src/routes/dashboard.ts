import { Hono } from 'hono';
import { getAuthUser, getPartnerId } from '../lib/authUser';
import {
  buildDerivedAllocations,
  buildAllocationsFromSource,
  buildNetWorthHistory,
  loadNetWorthSourceData,
} from '../lib/netWorthHistory';
import { loadDashboardInsights } from '../lib/dashboardInsights';
import { parseWholeNumber } from '../lib/requestValidation';
import { HTTP_STATUS } from '../constants/http';
import { loadActivity } from '../lib/activity';

export { buildNetWorthHistory } from '../lib/netWorthHistory';
export { buildActivityList, getActivityCutoff } from '../lib/activity';

const app = new Hono();

app.get('/summary', async (c) => {
  const source = await loadNetWorthSourceData(getAuthUser(c).id, getPartnerId(c));
  return c.json({
    data: {
      netWorth: buildNetWorthHistory(source),
      allocations: buildAllocationsFromSource(source),
    },
  });
});

app.get('/net-worth', async (c) => {
  const sourceData = await loadNetWorthSourceData(getAuthUser(c).id, getPartnerId(c));
  return c.json({ data: buildNetWorthHistory(sourceData) });
});

app.get('/allocations', async (c) => {
  const data = await buildDerivedAllocations(getAuthUser(c).id, getPartnerId(c));
  return c.json({ data });
});

app.get('/insights', async (c) => {
  const year = parseWholeNumber(c.req.query('year'));
  if (year === null || year < 1000 || year > 9998) {
    return c.json({ error: 'Invalid year' }, HTTP_STATUS.BAD_REQUEST);
  }
  const data = await loadDashboardInsights(getAuthUser(c).id, year);
  return c.json({ data });
});

app.get('/transactions', async (c) => {
  const data = await loadActivity(getAuthUser(c).id, getPartnerId(c));
  return c.json({ data });
});

export default app;
