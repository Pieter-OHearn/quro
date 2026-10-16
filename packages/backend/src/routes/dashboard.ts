import { Hono } from 'hono';
import { DEFAULT_NET_WORTH_RANGE, isNetWorthRange } from '@quro/shared';
import { getAuthUser, getPartnerId } from '../lib/authUser';
import {
  buildDerivedAllocations,
  buildAllocationsFromSource,
  buildDashboardHistory,
  buildNetWorthHistory,
  loadNetWorthSourceData,
} from '../lib/netWorthHistory';
import { loadDashboardInsights } from '../lib/dashboardInsights';
import { parseWholeNumber } from '../lib/requestValidation';
import { HTTP_STATUS } from '../constants/http';
import { loadActivity } from '../lib/activity';
import { loadSetupProgress } from '../lib/setupProgress';

export { buildNetWorthHistory } from '../lib/netWorthHistory';
export { buildActivityList, getActivityCutoff } from '../lib/activity';

const app = new Hono();

app.get('/summary', async (c) => {
  const source = await loadNetWorthSourceData(
    getAuthUser(c).id,
    getPartnerId(c),
    DEFAULT_NET_WORTH_RANGE,
    { yearStart: true },
  );
  const { netWorth, yearStart } = buildDashboardHistory(source);
  return c.json({
    data: { netWorth, allocations: buildAllocationsFromSource(source), yearStart },
  });
});

app.get('/net-worth', async (c) => {
  // Absent means the default range; any other value outside the list is refused.
  const range = c.req.query('range') ?? DEFAULT_NET_WORTH_RANGE;
  if (!isNetWorthRange(range)) {
    return c.json({ error: 'Invalid range' }, HTTP_STATUS.BAD_REQUEST);
  }
  const sourceData = await loadNetWorthSourceData(getAuthUser(c).id, getPartnerId(c), range);
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

// What first-run guidance needs to know: whether the household has an account and a transaction.
app.get('/setup', async (c) => {
  const data = await loadSetupProgress(getAuthUser(c).id, getPartnerId(c));
  return c.json({ data });
});

export default app;
