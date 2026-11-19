import { fileURLToPath } from 'node:url';

// 🧪 Test helpers: thani "flowboard_test" database la server oadu + cookies vechukkura chinna client
// ⚠️ Unmaiyaana "flowboard" database ah thodave thodaadhu!

export const TEST_DB = 'flowboard_test';
export const ADMIN_PASSWORD = 'test-admin-pass-123';

export async function startTestServer() {
  try {
    process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
  } catch {
    /* CI la .env illa, env variables la varum */
  }
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI venum (server/.env la)');

  process.env.ADMIN_PASSWORD = ADMIN_PASSWORD; // tests ku thani admin password
  if (!process.env.SHOW_SERVER_LOGS) console.log = () => {}; // 🤫 server "➕ Pudhu task" logs test output la vendaam
  delete process.env.ANTHROPIC_API_KEY; // 💸 tests la unmaiyaana AI call vendaam (demo mode)

  const dbModule = await import('../db.ts');
  const db = await dbModule.connectDb(process.env.MONGODB_URI, TEST_DB);
  if (!db.databaseName.endsWith('_test')) throw new Error('Safety: test database name must end with _test');

  // 🧹 Fresh start: pazhaya test data ellaam azhi, indexes thirumba
  await db.dropDatabase();
  await dbModule.ensureIndexes();
  const { runMigrations } = await import('../lib/boards.ts');
  await runMigrations();

  const { setRateLimitsEnabled } = await import('../lib/rateLimit.ts');
  setRateLimitsEnabled(false); // limits test mattum thani ah on pannum

  const { createApp } = await import('../app.ts');
  const server = createApp().listen(0); // 0 = kaaliyaa irukkura edhaavadhu port
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;

  return {
    url,
    db: dbModule,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await db.dropDatabase();
      await dbModule.closeDb();
    },
  };
}

// 🍪 Browser maadhiri cookies nyaabagam vechukkura client
export function makeClient(base) {
  const jar = new Map();

  async function request(method, path, { json, form } = {}) {
    const headers = {};
    if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    let body;
    if (json !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(json);
    } else if (form) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(form).toString();
    }

    const res = await fetch(base + path, { method, headers, body, redirect: 'manual' });

    for (const cookie of res.headers.getSetCookie()) {
      const [pair] = cookie.split(';');
      const [name, ...rest] = pair.split('=');
      const value = rest.join('=');
      if (!value || /expires=thu, 01 jan 1970/i.test(cookie)) jar.delete(name.trim());
      else jar.set(name.trim(), value);
    }

    const text = await res.text();
    let data = text;
    try {
      data = JSON.parse(text);
    } catch {
      /* HTML / CSV */
    }
    return { status: res.status, body: data, headers: res.headers, location: res.headers.get('location') };
  }

  return {
    jar,
    get: (path, opts) => request('GET', path, opts),
    post: (path, opts) => request('POST', path, opts),
    patch: (path, opts) => request('PATCH', path, opts),
    delete: (path, opts) => request('DELETE', path, opts),
  };
}

// 👤 Pudhu user sign up panni, login aana client tharum
let counter = 0;
export async function signUp(url, name = 'Test User') {
  counter++;
  const client = makeClient(url);
  const email = `user${counter}.${Date.now()}@test.local`;
  const password = 'test-password-123';
  const res = await client.post('/api/auth/signup', { json: { name, email, password } });
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { client, email, password, name };
}

// 👮 Admin login aana client
export async function adminClient(url) {
  const client = makeClient(url);
  const res = await client.post('/login', { form: { password: ADMIN_PASSWORD } });
  if (res.status !== 302 || !client.jar.has('admin_token')) throw new Error('admin login failed');
  return client;
}
