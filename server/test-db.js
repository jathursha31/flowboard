import { MongoClient } from 'mongodb';

// 🤫 .env padi
process.loadEnvFile();

// 🔌 MongoDB ku connect panna client
const client = new MongoClient(process.env.MONGODB_URI);

try {
  await client.connect(); // 📡 connect
  await client.db('admin').command({ ping: 1 }); // 🏓 "Hello, irukkiyaa?"
  console.log('✅ MongoDB connect aagiduchu! ☁️🎉');
} catch (err) {
  console.log('❌ Connect aagala:', err.message);
} finally {
  await client.close(); // 🔌 connection close
}