import { fileURLToPath } from 'node:url';
import { connectDb } from './db.ts';
import { runMigrations } from './lib/boards.ts';
import { createApp } from './app.ts';
import { sendDueReminders } from './lib/notify.ts';

// 🚀 Server start: .env padi → MongoDB connect → app oadu
// Code ellaam pirichu vechirukkom:
//   db.js          → MongoDB connection + collections
//   app.js         → Express app (routes ellaam inga serum)
//   lib/           → helpers, auth, boards, AI, rate limit, constants
//   routes/        → ovvoru section kkum thani file (admin, auth, boards, tasks...)
//   test/          → automated tests (npm test)

// 🤫 .env file la irunthu ragasiyangalai padi
try {
  process.loadEnvFile();
} catch {
  console.log('⚠️ .env file kidaikkala!');
}

// 🔑 .env values
const { ADMIN_PASSWORD, MONGODB_URI } = process.env;
if (!ADMIN_PASSWORD || !MONGODB_URI) {
  console.log('❌ .env la ADMIN_PASSWORD um MONGODB_URI um venum!');
  process.exit(1);
}

// ☁️ MongoDB Atlas ku connect
// MONGODB_DB: browser tests thani database use pannum (peru _test la mudiyanum, unmaiyaana data safe)
const dbName = process.env.MONGODB_DB || 'flowboard';
if (dbName !== 'flowboard' && !dbName.endsWith('_test')) {
  console.log('❌ MONGODB_DB must be flowboard or end with _test');
  process.exit(1);
}
await connectDb(MONGODB_URI, dbName);
console.log('☁️ MongoDB connect aagiduchu');
await runMigrations();

// 🌐 Build panna website irundhaa (Docker / deploy), adhaiyum ore server la serve pannu
const staticDir = process.env.STATIC_DIR || fileURLToPath(new URL('../flowboard/dist', import.meta.url));
const app = createApp({ staticDir });

// 📅 Due date reminders: ippo oru thadavai, apram mani ku oru thadavai
const runReminders = () => sendDueReminders().catch((err) => console.log('⚠️ Reminder error:', err.message));
runReminders();
setInterval(runReminders, 60 * 60 * 1000);

// 🚪 3001 kadhavu
const PORT = Number(process.env.PORT) || 3001; // Render maari hosting PORT kudukkum, illana 3001
app.listen(PORT, (err) => {
  // 🚪 Kadhavu (port) already vera server pidichirundhaa, poi "ready" sollaama theliva sollu
  if (err) {
    console.log(`❌ Port ${PORT} already use la irukku! Vera terminal la server already odudhu.`);
    console.log('   Antha terminal la Ctrl + C pannittu, thirumba npm start pannunga.');
    process.exit(1);
  }
  console.log(`Server ready: http://localhost:${PORT}`);
});
