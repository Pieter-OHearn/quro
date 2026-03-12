import { Hono } from 'hono';
import { corsMiddleware } from './middleware/cors';
import { errorHandler } from './middleware/errorHandler';
import { requireAuth } from './middleware/auth';
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
import {
  getCoreReadinessReport,
  getHealthReport,
  getPensionImportReadinessReport,
  getReadinessStatusCode,
} from './lib/readiness';

export const app = new Hono();

app.use('*', corsMiddleware);
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
app.use('/api/savings/*', requireAuth);
app.use('/api/investments/*', requireAuth);
app.use('/api/pensions/*', requireAuth);
app.use('/api/mortgages/*', requireAuth);
app.use('/api/debts/*', requireAuth);
app.use('/api/salary/*', requireAuth);
app.use('/api/goals/*', requireAuth);
app.use('/api/budget/*', requireAuth);
app.use('/api/dashboard/*', requireAuth);
app.use('/api/currency/*', requireAuth);
app.use('/api/capabilities', requireAuth);
app.use('/api/capabilities/*', requireAuth);
app.use('/api/settings', requireAuth);
app.use('/api/settings/*', requireAuth);

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

export default {
  port: parseInt(process.env.PORT || '3000'),
  fetch: app.fetch,
};
