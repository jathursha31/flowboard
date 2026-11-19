import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// 🧹 Test aarambikkura munnaadi pazhaya browser-test data ah azhi
export default function globalSetup() {
  execFileSync('node', ['test/drop-db.mjs', 'flowboard_e2e_test'], { cwd: fileURLToPath(new URL('../../server', import.meta.url)), stdio: 'inherit' });
}
