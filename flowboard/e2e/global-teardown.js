import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// 🧹 Ellaa test um mudinjadhum test database ah azhi
export default function globalTeardown() {
  execFileSync('node', ['test/drop-db.mjs', 'flowboard_e2e_test'], { cwd: fileURLToPath(new URL('../../server', import.meta.url)), stdio: 'inherit' });
}
