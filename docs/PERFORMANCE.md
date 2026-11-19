# ⚡ Performance

Load test with the built-in tool (no extra packages):

```bash
cd server
node scripts/loadtest.mjs --url http://localhost:3001 --concurrency 50 --seconds 8 /api/banner /api/health /api/tasks /
```

> On Git Bash for Windows, prefix with `MSYS_NO_PATHCONV=1` (otherwise `/api/...` is turned into a Windows path).

## Results (2026-10-24)

Laptop (Windows, Node 24), production mode (`flowboard/dist` served by Express), **50 concurrent clients**, database = MongoDB Atlas **free M0** cluster in Mumbai.

| Path | Requests/sec | p50 | p95 | Notes |
|---|---:|---:|---:|---|
| `/api/updates` | **7,059** | 6 ms | 15 ms | in-memory cache (30 s, cleared when the admin edits) |
| `/api/banner` | **5,980** | 6 ms | 18 ms | in-memory cache |
| `/` (React page) | 1,242 | 38 ms | 54 ms | static file |
| `/assets/index-*.js` | 284 | 175 ms | 191 ms | gzip on every request: 291 KB → 91 KB |
| `/api/health` | 91 | 570 ms | 1,132 ms | 1 database ping per request |
| `/api/tasks` | 56 | 925 ms | 1,170 ms | 2 database queries per request |

## What it tells us

- **The Node/Express layer is not the bottleneck.** Without the database it serves thousands of requests per second with single-digit-millisecond latency.
- **The database is.** Atlas M0 is a shared, rate-limited free tier (≈100 operations/second) about 60 ms away. Under 50 concurrent users, database-backed routes queue up.
- Real users don't send 50 requests every second each; at normal use (a few requests per user per minute) this setup comfortably handles hundreds of active users.

## Optimisations in the code

| What | Where | Effect |
|---|---|---|
| In-memory cache with "single flight" (100 waiting requests → 1 database query) | `server/lib/cache.ts` | public endpoints went from database-bound to ~6–7k req/s |
| gzip compression (SSE streams excluded) | `server/app.js` | 69% smaller JavaScript/JSON over the network |
| Long-term caching of hashed assets (`immutable`, 1 year) | `server/app.js` | returning visitors download almost nothing |
| Lazy-loaded pages and popups | `flowboard/src/App.jsx`, `Demo.jsx` | smaller first download |
| Indexes for every hot query (`boardId+order`, `userId`, `assigneeId`, TTL indexes) | `server/db.js` | queries use indexes instead of scanning |
| `bulkWrite` for drag & drop reorder | `server/routes/tasks.js` | one round trip instead of one per task |
| Server-Sent Events instead of polling for live boards | `server/lib/realtime.ts` | no repeated "anything new?" requests |

## Next steps if it needs to scale

1. Move to a paid Atlas tier in the same region as the server (biggest win: removes the rate limit and most of the latency).
2. Put a CDN in front of `/assets` so static files never reach Node.
3. Pre-compress assets at build time instead of gzipping on every request.
4. For many server instances: move the in-memory cache, rate limits and SSE hub to Redis.
