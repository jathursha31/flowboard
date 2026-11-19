import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import compression from 'compression';
import { loadUser } from './lib/auth.ts';
import { securityHeaders } from './lib/security.ts';
import { recordError, requestTracker } from './lib/observability.ts';
import adminRoutes from './routes/admin.ts';
import authRoutes from './routes/auth.ts';
import publicRoutes from './routes/public.ts';
import accountRoutes from './routes/account.ts';
import boardRoutes from './routes/boards.ts';
import taskRoutes from './routes/tasks.ts';
import aiRoutes from './routes/ai.ts';
import realtimeRoutes from './routes/realtime.ts';
import notificationRoutes from './routes/notifications.ts';
import searchRoutes from './routes/search.ts';
import attachmentRoutes from './routes/attachments.ts';
import docsRoutes from './routes/docs.ts';
import healthRoutes from './routes/health.ts';
import dataRoutes from './routes/data.ts';
import developerRoutes from './routes/developer.ts';
import chatRoutes from './routes/chat.ts';
import analyticsRoutes from './routes/analytics.ts';
import billingRoutes from './routes/billing.ts';
import pushRoutes from './routes/push.ts';
import calendarRoutes from './routes/calendar.ts';
import reportRoutes from './routes/reports.ts';

// 🛡️ Website (React) pages ku CSP: namma JS + Google sign-in + Google fonts mattum
const SPA_CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com/gsi/client",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://accounts.google.com/gsi/",
  "frame-src https://accounts.google.com/gsi/",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

// 🏭 Kitchen ready: Express app (listen pannaadhu, adhai index.js / tests pannum)
// staticDir = build panna website folder (flowboard/dist): production / Docker la ore server website + API rendum
export function createApp({ staticDir }: { staticDir?: string } = {}) {
  const app = express();
  app.disable('x-powered-by'); // "Express use pannurom" nu hacker ku clue kudukkaadhe
  // Render maari proxy pinnaadi mattum TRUST_PROXY=1 podunga (unmaiyaana user IP + HTTPS therinjukka).
  // Proxy illaama on pannaa yaar venumnaalum "X-Forwarded-For" la poi IP solli rate limit ah thaandalaam!
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
  app.use(requestTracker); // 🪪 request ID + ⏱️ neram + log
  app.use(securityHeaders); // 🛡️
  // 🗜️ gzip: JSON / JS / CSS ah 70-80% chinnadhaakki anuppu. Live (SSE) stream ah compress pannakoodaadhu (message thangidum)
  app.use(compression({ filter: (req, res) => !req.path.endsWith('/events') && compression.filter(req, res) }));
  const json = express.json();
  app.use((req: Request, res: Response, next: NextFunction) => (req.path === '/api/import' || req.path === '/api/billing/webhook' ? next() : json(req, res, next))); // 📦 import ku thani (periya) limit
  app.use(express.urlencoded({ extended: false }));
  app.use('/api', loadUser); // ellaa /api routes kkum munnaadi user ah kandupidi

  // 🌐 Production: website files (index.html, /assets/*.js)
  const indexHtml = staticDir && path.join(staticDir, 'index.html');
  const hasSite = Boolean(indexHtml && fs.existsSync(indexHtml));
  const sendSite = (req: Request, res: Response) => {
    res.set({ 'Content-Security-Policy': SPA_CSP, 'Cache-Control': 'no-cache' });
    res.sendFile(indexHtml as string);
  };
  if (hasSite) {
    app.get('/', sendSite); // backend "links menu" page ku badhil website
    app.use(
      express.static(staticDir as string, {
        index: false,
        setHeaders: (res: Response, file: string) => {
          res.set('Content-Security-Policy', SPA_CSP);
          // /assets/index-abc123.js: peru la hash irukku, maaraadhu → 1 varusham cache
          if (file.includes(`${path.sep}assets${path.sep}`)) res.set('Cache-Control', 'public, max-age=31536000, immutable');
          else res.set('Cache-Control', 'no-cache'); // sw.js, manifest: eppovum pudhusu
        },
      })
    );
  }

  app.use(healthRoutes); // 🩺 /api/health, /api/admin/metrics
  app.use(adminRoutes); // 👮 /, /login, /admin...
  app.use(authRoutes); // ✍️ /api/auth/...
  app.use(publicRoutes); // 🌍 /api/contact, /api/banner, /api/reviews, /api/updates
  app.use(accountRoutes); // 👤 /api/account/...
  app.use(boardRoutes); // 📋 /api/boards/...
  app.use(taskRoutes); // 📝 /api/tasks/...
  app.use(aiRoutes); // 🤖 /api/ai/tasks
  app.use(realtimeRoutes); // ⚡ /api/boards/:id/events (live)
  app.use(notificationRoutes); // 🔔 /api/notifications
  app.use(searchRoutes); // ⌨️ /api/search (Ctrl + K)
  app.use(attachmentRoutes); // 📎 /api/tasks/:id/attachments, /api/attachments/:id
  app.use(docsRoutes); // 📜 /api/docs (Swagger UI) + /api/openapi.json
  app.use(dataRoutes); // 📦 /api/account/export, /api/boards/:id/export.csv, /api/import
  app.use(analyticsRoutes); // 📊 /api/track
  app.use(billingRoutes); // 💳 /api/billing/...
  app.use(pushRoutes); // 🔔 /api/push/...
  app.use(reportRoutes); // 📊 /api/account/report
  app.use(calendarRoutes); // 📅 /api/account/calendar, /api/calendar/:token.ics
  app.use(chatRoutes); // 💬 /api/boards/:id/chat, /api/chat/:id
  app.use(developerRoutes); // 🔌 /api/keys, /api/boards/:id/webhooks, /api/webhooks/:id

  // 🌐 /app, /account, /signin… React pages: ellaam index.html (React Router paathukkum)
  if (hasSite) {
    app.get(/^\/(?!api\/|admin|login|logout).*/, sendSite);
  }

  // 🔎 Theriyaadha /api address: JSON 404
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  // 🧯 Errors: request problem na theliva JSON, server bug na 500 + request ID (log la thedalaam)
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That is too big. Files can be up to 2 MB.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request.' });
    if (res.headersSent) return next(err);
    recordError(req, res, err);
    console.error(`🔥 [${res.locals.requestId}] ${req.method} ${req.originalUrl}:`, err);
    res.status(500).json({ error: 'Something went wrong on our side. Please try again.', requestId: res.locals.requestId });
  });

  return app;
}
