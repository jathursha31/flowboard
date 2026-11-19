import dns from 'node:dns';
import { GridFSBucket, MongoClient } from 'mongodb';
import type { Collection, Db, Document } from 'mongodb';
import type { AnalyticsDoc, ApiKeyDoc, BoardDoc, ChatMessageDoc, PushSubscriptionDoc, SettingDoc, TaskDoc, UserDoc, WebhookDoc } from './types.ts';

// ☁️ MongoDB connection + collections. Mattha files: import { tasks } from './db.ts'
// (connectDb() oadina apram thaan intha variables ku value varum)

// 📗 Router DNS ku badhil Google / Cloudflare DNS use pannu (MongoDB address kandupidikka)
dns.setServers(['8.8.8.8', '1.1.1.1']);

let client: MongoClient | undefined;
export let db: Db;

// 🗃️ Collections
export let messages: Collection<Document>;
export let tasks: Collection<TaskDoc>;
export let sessions: Collection<Document>; // 🎟️ admin tickets
export let users: Collection<UserDoc>; // 👤 user accounts
export let userSessions: Collection<Document>; // 🎟️ user tickets
export let boards: Collection<BoardDoc>; // 📋 boards (ovvoru user kkum pala boards)
export let reviews: Collection<Document>; // ⭐ users ezhudhura reviews (admin approve pannanum)
export let updates: Collection<Document>; // 📰 admin podura news / updates
export let auditLog: Collection<Document>; // 📜 admin enna seiyuraanga nu record
export let settings: Collection<SettingDoc>; // ⚙️ site settings (banner maari, oru doc oru setting)
export let notifications: Collection<Document>; // 🔔 user ku vara alerts (assign, comment, share, due date)
export let passwordResets: Collection<Document>; // 🔑 'forgot password' links (1 mani neram mattum)
export let activity: Collection<Document>; // 🕓 board la yaar enna pannaanga (history)
export let files: GridFSBucket; // 📎 task attachments (GridFS: perusaana files ah MongoDB la chunks ah vaikkum)
export let apiKeys: Collection<ApiKeyDoc>; // 🔑 developers ku personal API keys
export let webhooks: Collection<WebhookDoc>; // 🪝 board maatrangalai vera app ku anuppa
export let chatMessages: Collection<ChatMessageDoc>; // 💬 board team chat
export let analytics: Collection<AnalyticsDoc>; // 📊 page views + events
export let pushSubscriptions: Collection<PushSubscriptionDoc>; // 🔔 phone / computer alerts

// ☁️ Connect panni collections ah ready pannu. dbName: normal 'flowboard', tests ku 'flowboard_test'
export async function connectDb(uri: string, dbName = 'flowboard'): Promise<Db> {
  client = new MongoClient(uri);
  await client.connect();
  db = client.db(dbName);

  messages = db.collection('messages');
  tasks = db.collection('tasks');
  sessions = db.collection('sessions');
  users = db.collection('users');
  userSessions = db.collection('userSessions');
  boards = db.collection('boards');
  reviews = db.collection('reviews');
  updates = db.collection('updates');
  auditLog = db.collection('auditLog');
  settings = db.collection('settings');
  notifications = db.collection('notifications');
  passwordResets = db.collection('passwordResets');
  activity = db.collection('activity');
  files = new GridFSBucket(db, { bucketName: 'attachments' });
  apiKeys = db.collection('apiKeys');
  webhooks = db.collection('webhooks');
  chatMessages = db.collection('chatMessages');
  analytics = db.collection('analytics');
  pushSubscriptions = db.collection('pushSubscriptions');

  await ensureIndexes();
  return db;
}

// 📇 Indexes (already irundhaa MongoDB onnum pannaadhu)
export async function ensureIndexes() {
  // ⏰ Tickets thaane azhiyum: admin 8 mani, user 7 naal
  await sessions.createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 8 });
  await userSessions.createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

  // 🚫 Ore email la rendu account koodaadhu
  await users.createIndex({ email: 1 }, { unique: true });

  // ⚡ Vegamaa thedu: "intha user oda boards", "intha board oda tasks"
  await boards.createIndex({ userId: 1 });
  await reviews.createIndex({ userId: 1 }, { unique: true }); // oru user ku oru review mattum
  await auditLog.createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 }); // 📜 90 naal kazhichu thaanaa azhiyum
  await messages.createIndex({ userId: 1 }); // ✉️ user oda messages + replies
  await tasks.createIndex({ boardId: 1, column: 1, order: 1 });
  await tasks.createIndex({ boardId: 1, order: 1, _id: 1 }); // ⚡ board tasks list (sort order padi) index la irunthe
  await tasks.createIndex({ assigneeId: 1 }); // 🌅 plan my day / account delete
  await notifications.createIndex({ userId: 1, createdAt: -1 }); // 🔔 en notifications, pudhusu mudhalla
  await notifications.createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 }); // 30 naal kazhichu azhiyum
  await passwordResets.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // 🔑 expire aana link thaanaa azhiyum
  await passwordResets.createIndex({ tokenHash: 1 }, { unique: true });
  await activity.createIndex({ boardId: 1, createdAt: -1 }); // 🕓 board history, pudhusu mudhalla
  await activity.createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 }); // 90 naal
  await apiKeys.createIndex({ keyHash: 1 }, { unique: true }); // 🔑 ovvoru API request kkum hash vechu thedum
  await apiKeys.createIndex({ userId: 1 });
  await users.createIndex({ calendarToken: 1 }, { unique: true, sparse: true }); // 📅
  await users.createIndex({ stripeCustomerId: 1 }, { sparse: true }); // 💳 Stripe webhook la user ah kandupidikka
  await webhooks.createIndex({ boardId: 1 }); // 🪝 board la maatram → andha board webhooks
  await webhooks.createIndex({ userId: 1 });
  await chatMessages.createIndex({ boardId: 1, _id: -1 }); // 💬 board chat, pudhusu mudhalla
  await analytics.createIndex({ type: 1, createdAt: 1 }); // 📊 kadaisi 30 naal
  await pushSubscriptions.createIndex({ endpoint: 1 }, { unique: true }); // 🔔 ore device rendu thadavai illa
  await pushSubscriptions.createIndex({ userId: 1 });
  await analytics.createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 }); // 90 naal kazhichu azhiyum
}

export async function closeDb() {
  await client?.close();
}
