import { Hono } from 'hono';
import holdings from './holdings';
import properties from './properties';

const app = new Hono();
app.route('/', holdings);
app.route('/', properties);

export default app;
