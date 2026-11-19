import dns from 'node:dns';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';

// 🧹 Browser tests munnaadi / apram: test database ah azhi. Peru "_test" la mudiyalanna THODAADHU
// node test/drop-db.mjs flowboard_e2e_test
const name = process.argv[2];
if (!name || !name.endsWith('_test')) {
  console.error('Refusing: database name must end with _test');
  process.exit(1);
}

dns.setServers(['8.8.8.8', '1.1.1.1']);
try {
  process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
} catch {
  /* CI la env variables la varum */
}

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
await client.db(name).dropDatabase();
await client.close();
console.log(`🧹 dropped ${name}`);
