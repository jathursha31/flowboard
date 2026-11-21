// ▲ Vercel build: 1) website build → server/public (Vercel CDN serve pannum)
//                 2) server TypeScript code ah oru JS file aa bundle → .vercel-build/server.mjs
// npm packages (express, mongodb...) bundle la illa: Vercel node_modules la irunthu edukkum
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const server = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(server, '..', 'flowboard');

if (!process.argv.includes('--server-only')) {
  console.log('🌐 Website build...');
  execSync('npm ci && npm run build', { cwd: web, stdio: 'inherit' });
  fs.rmSync(path.join(server, 'public'), { recursive: true, force: true });
  fs.cpSync(path.join(web, 'dist'), path.join(server, 'public'), { recursive: true });
}

console.log('⚙️ Server bundle...');
await build({
  entryPoints: [path.join(server, 'vercel', 'entry.ts')],
  outfile: path.join(server, '.vercel-build', 'server.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  packages: 'external',
  logLevel: 'info',
});
console.log('✅ Vercel build ready');
