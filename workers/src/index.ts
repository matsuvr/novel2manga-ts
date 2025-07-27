import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types/env';
import { analyzeRoute } from './routes/analyze';
import { jobRoute } from './routes/job';

const app = new Hono<{ Bindings: Env }>();

app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length'],
  maxAge: 86400,
  credentials: true,
}));

app.get('/', (c) => {
  return c.json({ message: 'Novel2Manga API' });
});

app.route('/api/analyze', analyzeRoute);
app.route('/api/job', jobRoute);

export default app;