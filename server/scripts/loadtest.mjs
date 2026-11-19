// ⚡ Load test: "ore neraththula 50 per vandhaa server enna pannum?"
// node scripts/loadtest.mjs --url http://localhost:3001 --concurrency 50 --seconds 10 /api/health /api/banner
// (package illaama: Node la ulla fetch)

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args.splice(i, 2)[1];
};
const base = opt('url', 'http://localhost:3001');
const concurrency = Number(opt('concurrency', 50));
const seconds = Number(opt('seconds', 10));
const paths = args.length ? args : ['/api/health'];

function percentile(sorted, p) {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0;
}

async function run(path) {
  const latencies = [];
  let errors = 0;
  let bytes = 0;
  const stopAt = performance.now() + seconds * 1000;

  // 👥 "concurrency" alavu workers: ovvorutharum stop aagura varaikkum request anuppikitte iruppaanga
  async function worker() {
    while (performance.now() < stopAt) {
      const start = performance.now();
      try {
        const res = await fetch(base + path, { headers: { 'accept-encoding': 'gzip' } });
        const body = await res.arrayBuffer();
        bytes += body.byteLength;
        if (!res.ok) errors++;
      } catch {
        errors++;
      }
      latencies.push(performance.now() - start);
    }
  }
  const began = performance.now();
  await Promise.all(Array.from({ length: concurrency }, worker));
  const elapsed = (performance.now() - began) / 1000;
  latencies.sort((a, b) => a - b);
  return {
    path,
    requests: latencies.length,
    'req/s': Math.round(latencies.length / elapsed),
    'p50 ms': Math.round(percentile(latencies, 50)),
    'p95 ms': Math.round(percentile(latencies, 95)),
    'p99 ms': Math.round(percentile(latencies, 99)),
    errors,
    'avg KB': +(bytes / Math.max(1, latencies.length) / 1024).toFixed(2),
  };
}

console.log(`⚡ ${base} · ${concurrency} at once · ${seconds}s per path\n`);
const results = [];
for (const path of paths) results.push(await run(path));
console.table(results);
