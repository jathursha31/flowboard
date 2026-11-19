import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

// 📈 Observability: ovvoru request kkum ID, log, evlo neram aachu, errors
// (Real companies la Datadog / Grafana maari tools idhai paakkum. Inga naame chinna version)

const startedAt = Date.now();
const MAX_SAMPLES = 2000; // kadaisi 2000 requests oda neram mattum (memory nirambaama)

interface RouteStats {
  count: number;
  errors: number;
  totalMs: number;
  maxMs: number;
}

export interface RecentError {
  requestId: string;
  method: string;
  path: string;
  status: number;
  message: string;
  at: string;
}

const durations: number[] = []; // ms, circular
let total = 0;
let serverErrors = 0;
const byStatus = new Map<number, number>();
const byRoute = new Map<string, RouteStats>();
const recentErrors: RecentError[] = [];

// "/api/tasks/6adc…/comments" → "/api/tasks/:id/comments" (ovvoru id kkum thani row vendaam)
export function routeKey(req: Request): string {
  const path = req.route?.path ? `${req.baseUrl ?? ''}${req.route.path}` : req.path.replace(/\/[0-9a-f]{24}(?=\/|$)/g, '/:id');
  return `${req.method} ${path}`;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

// 🪪 + ⏱️ Ovvoru request kkum: ID kudu, mudinjadhum log + count
export function requestTracker(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.get('x-request-id');
  const id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
  res.locals.requestId = id;
  res.set('X-Request-Id', id); // bug report la intha ID sonnaa log la kandupidikkalaam
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    if (req.path.endsWith('/events')) return; // live connections ah count pannaadhe (romba neram open)
    total++;
    durations.push(ms);
    if (durations.length > MAX_SAMPLES) durations.shift();
    byStatus.set(res.statusCode, (byStatus.get(res.statusCode) ?? 0) + 1);

    const key = routeKey(req);
    const stats = byRoute.get(key) ?? { count: 0, errors: 0, totalMs: 0, maxMs: 0 };
    stats.count++;
    stats.totalMs += ms;
    stats.maxMs = Math.max(stats.maxMs, ms);
    if (res.statusCode >= 500) {
      stats.errors++;
      serverErrors++;
    }
    byRoute.set(key, stats);

    if (process.env.LOG_REQUESTS !== 'off') {
      const line = { t: new Date().toISOString(), id, method: req.method, path: req.originalUrl.split('?')[0], status: res.statusCode, ms: Math.round(ms) };
      if (process.env.LOG_FORMAT === 'json') console.log(JSON.stringify(line)); // hosting log tools ku
      else if (res.statusCode >= 400 || ms > 1000) console.log(`${res.statusCode >= 500 ? '🔥' : '⚠️'} ${line.method} ${line.path} ${line.status} ${line.ms}ms [${id.slice(0, 8)}]`);
    }
  });
  next();
}

// 🔥 500 error vandhaa nyaabagam vechukko (admin health page ku)
export function recordError(req: Request, res: Response, err: unknown): void {
  recentErrors.unshift({
    requestId: res.locals.requestId,
    method: req.method,
    path: req.originalUrl.split('?')[0],
    status: 500,
    message: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
    at: new Date().toISOString(),
  });
  recentErrors.length = Math.min(recentErrors.length, 20);
}

export interface MetricsSnapshot {
  uptimeSeconds: number;
  requests: number;
  serverErrors: number;
  errorRate: number;
  latencyMs: { p50: number; p95: number; p99: number };
  byStatus: Record<string, number>;
  slowestRoutes: { route: string; count: number; avgMs: number; maxMs: number }[];
  busiestRoutes: { route: string; count: number; avgMs: number }[];
  recentErrors: RecentError[];
  memoryMb: number;
}

export function metricsSnapshot(): MetricsSnapshot {
  const sorted = [...durations].sort((a, b) => a - b);
  const routes = [...byRoute.entries()].map(([route, s]) => ({ route, count: s.count, avgMs: Math.round(s.totalMs / s.count), maxMs: Math.round(s.maxMs) }));
  return {
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    requests: total,
    serverErrors,
    errorRate: total ? +(serverErrors / total).toFixed(4) : 0,
    latencyMs: { p50: Math.round(percentile(sorted, 50)), p95: Math.round(percentile(sorted, 95)), p99: Math.round(percentile(sorted, 99)) },
    byStatus: Object.fromEntries([...byStatus.entries()].map(([k, v]) => [String(k), v])),
    slowestRoutes: [...routes].sort((a, b) => b.avgMs - a.avgMs).slice(0, 5),
    busiestRoutes: [...routes].sort((a, b) => b.count - a.count).slice(0, 5).map(({ route, count, avgMs }) => ({ route, count, avgMs })),
    recentErrors: [...recentErrors],
    memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
  };
}
