import { Hono } from 'hono';
import { corsMiddleware } from './middleware/cors';
import { errorHandler } from './middleware/errorHandler';
import { requireAuth } from './middleware/auth';
import { requireCsrf } from './middleware/csrf';
import auth from './routes/auth';
import savings from './routes/savings';
import investments from './routes/investments';
import pensions from './routes/pensions';
import pensionImports from './routes/pension-imports';
import mortgages from './routes/mortgages';
import debts from './routes/debts';
import salary from './routes/salary';
import goals from './routes/goals';
import budget from './routes/budget';
import dashboard from './routes/dashboard';
import currency from './routes/currency';
import capabilities from './routes/capabilities';
import settings from './routes/settings';
import partner from './routes/partner';
import bunq from './routes/bunq';
import plan from './routes/plan';
import employments from './routes/employments';
import {
  getCoreReadinessReport,
  getHealthReport,
  getPensionImportReadinessReport,
  getReadinessStatusCode,
} from './lib/readiness';
import { startSessionCleanup } from './lib/sessionCleanup';
import { startBunqSyncScheduler } from './lib/bunqSyncScheduler';
import { startHoldingPriceSyncScheduler } from './lib/holdingPriceSyncScheduler';
import { startCurrencyRateSyncScheduler } from './lib/currencyRateSyncScheduler';
import { startNetWorthSnapshotScheduler } from './lib/netWorthSnapshotScheduler';
import { httpTracing } from './lib/tracing';

export const app = new Hono();

app.use('*', httpTracing);
app.use('*', corsMiddleware);
app.use('*', requireCsrf);
app.use('/api/*', requireAuth);
app.onError(errorHandler);

// Public routes
app.route('/api/auth', auth);
app.get('/api/health', (c) => c.json(getHealthReport()));
app.get('/api/readiness', async (c) => {
  const report = await getCoreReadinessReport();
  return c.json(report, getReadinessStatusCode(report));
});
app.get('/api/readiness/pension-import', async (c) => {
  const report = await getPensionImportReadinessReport();
  return c.json(report, getReadinessStatusCode(report));
});

// Protected routes
app.route('/api/savings', savings);
app.route('/api/investments', investments);
app.route('/api/pensions/imports', pensionImports);
app.route('/api/pensions', pensions);
app.route('/api/mortgages', mortgages);
app.route('/api/debts', debts);
app.route('/api/salary', salary);
app.route('/api/goals', goals);
app.route('/api/budget', budget);
app.route('/api/dashboard', dashboard);
app.route('/api/currency', currency);
app.route('/api/capabilities', capabilities);
app.route('/api/settings', settings);
app.route('/api/partner', partner);
app.route('/api/bunq', bunq);
app.route('/api/plan', plan);
app.route('/api/employments', employments);

if (process.env.NODE_ENV !== 'test') {
  startSessionCleanup();
  startBunqSyncScheduler();
  startHoldingPriceSyncScheduler();
  startCurrencyRateSyncScheduler();
  startNetWorthSnapshotScheduler();
}

export default {
  port: parseInt(process.env.PORT || '3000'),
  hostname: process.env.HOST ?? '0.0.0.0',
  fetch: app.fetch,
};
