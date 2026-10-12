import { Hono } from 'hono';
import { getConfig, type Config } from './config';
import { corsMiddleware } from './middleware/cors';
import { errorHandler } from './middleware/errorHandler';
import { requireAuth } from './middleware/auth';
import { requireCsrf } from './middleware/csrf';
import { pauseWritesDuringMaintenance } from './middleware/maintenance';
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
import { enabledCapabilities } from './lib/capabilityRegistry';
import {
  getCoreReadinessReport,
  getHealthReport,
  getPensionImportReadinessReport,
  getReadinessStatusCode,
} from './lib/readiness';
import { httpTracing } from './lib/tracing';

/**
 * Builds the API. Routes that belong to an optional capability (see lib/capabilityRegistry.ts) are
 * mounted only when its configuration is complete, so a disabled integration has no endpoints
 * to probe or misuse. Core routes never depend on an optional service.
 */
export function createApp(config: Config = getConfig()) {
  const enabled = enabledCapabilities(config);
  const app = new Hono();

  app.use('*', httpTracing);
  app.use('*', corsMiddleware);
  app.use('*', requireCsrf);
  app.use('/api/*', requireAuth);
  app.use('/api/*', pauseWritesDuringMaintenance);
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
  // Before /api/pensions, which would otherwise answer for the longer path.
  if (enabled.has('pensionImport')) app.route('/api/pensions/imports', pensionImports);
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
  if (enabled.has('bunq')) app.route('/api/bunq', bunq);
  app.route('/api/plan', plan);
  app.route('/api/employments', employments);

  return app;
}
