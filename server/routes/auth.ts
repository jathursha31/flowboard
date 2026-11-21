import express from 'express';
import crypto from 'node:crypto';
import { AVATAR_COLORS, EMAIL_PATTERN } from '../lib/constants.ts';
import { getCookie, isText } from '../lib/helpers.ts';
import { userAuthLimit } from '../lib/rateLimit.ts';
import { checkPassword, hashPassword, publicUser, startUserSession } from '../lib/auth.ts';
import { addStarterTasks, ensureDefaultBoard } from '../lib/boards.ts';
import { passwordResets, userSessions, users } from '../db.ts';
import { emailEnabled, sendEmail } from '../lib/email.ts';
import { verifyGoogleToken } from '../lib/google.ts';
import { must } from '../lib/helpers.ts';
import { billingEnabled } from '../lib/billing.ts';

// ✍️ Sign up, login, logout, "yaar login"
const router = express.Router();

// 👋 Test vazhi
router.get('/api/hello', (req, res) => {
  res.json({ message: 'Vanakkam! Kitchen open 👨‍🍳' });
});

// ✍️ SIGN UP: pudhu account (🚦 userAuthLimit: 15 nimishaththukku 10 try)
router.post('/api/auth/signup', userAuthLimit, async (req, res) => {
  const { name, email, password } = req.body || {};

  if (!isText(name) || name.trim().length < 2) {
    return res.status(400).json({ error: 'Please enter your name.' });
  }
  if (!isText(email) || !EMAIL_PATTERN.test(email.trim())) {
    return res.status(400).json({ error: 'Please enter a valid email.' });
  }
  if (!isText(password) || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  let result;
  try {
    result = await users.insertOne({
      name: name.trim(),
      email: cleanEmail,
      passwordHash: await hashPassword(password), // 🔒 unmaiyaana password save aagaadhu!
      avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)], // 🆕 🎨 random colour
      createdAt: new Date(),
    });
  } catch (err) {
    // 11000 = unique index: intha email already irukku
    if ((err as { code?: number }).code === 11000) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    throw err;
  }

  const board = await ensureDefaultBoard(result.insertedId); // 🆕 📋 pudhu user kku "My board"
  await addStarterTasks(result.insertedId, board._id); // 🌱 sondha starter tasks
  await startUserSession(res, result.insertedId);

  console.log('👤 Pudhu user:', cleanEmail);
  res.status(201).json({ user: publicUser(must(await users.findOne({ _id: result.insertedId }), 'User')) });
});

// 🔑 LOGIN (🚦 userAuthLimit: 15 nimishaththukku 10 try)
router.post('/api/auth/login', userAuthLimit, async (req, res) => {
  const { email, password } = req.body || {};

  if (!isText(email) || !isText(password)) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = await users.findOne({ email: email.trim().toLowerCase() });

  // 🤐 Email thappaa password thappaa nu solla maattom (hacker ku clue kudukkakoodaadhu)
  if (!user || !(await checkPassword(password, user.passwordHash))) {
    console.log('🚫 User login fail:', email);
    return res.status(401).json({ error: 'Wrong email or password.' });
  }

  // 🆕 🚫 Admin disable panniyirundhaa ulla vida koodaadhu
  // (password sari na mattum solrom, illana hacker ku "intha email irukku" nu clue kidaikkum)
  if (user.disabled) {
    return res.status(403).json({ error: 'This account has been disabled. Please contact support.' });
  }

  await startUserSession(res, user._id);
  console.log('✅ User login:', user.email);
  res.json({ user: publicUser(user) });
});

// 🚪 LOGOUT
router.post('/api/auth/logout', async (req, res) => {
  const token = getCookie(req, 'user_token');
  if (token) await userSessions.deleteOne({ token });
  res.clearCookie('user_token');
  res.json({ ok: true });
});

// 👤 ME: ippo yaar login aagirukkaanga?
router.get('/api/auth/me', (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null });
});

// 🆕 ⚙️ Website ku: endha optional features on (Google button kaattalaamaa, email irukkaa)
router.get('/api/config', (req, res) => {
  // live: 'sse' = live connection (normal server), 'poll' = Vercel maari serverless la 15 second ku oru thadavai kelu
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || null, emailEnabled: emailEnabled(), billingEnabled: billingEnabled(), live: process.env.VERCEL ? 'poll' : 'sse' });
});

// 🆕 🔑 FORGOT PASSWORD: reset link email la anuppu (1 mani neram mattum vela seiyum)
// 🤐 Email irundhaalum illaavittaalum ore badhil: "intha email la account irukkaa" nu yaarum kandupidikka koodaadhu
const RESET_MS = 60 * 60 * 1000;
const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex'); // DB la token ah apdiye vaikka maattom

router.post('/api/auth/forgot', userAuthLimit, async (req, res) => {
  const { email } = req.body || {};
  if (!isText(email) || !EMAIL_PATTERN.test(email.trim())) return res.status(400).json({ error: 'Please enter a valid email.' });

  const user = await users.findOne({ email: email.trim().toLowerCase() });
  if (user && !user.disabled) {
    const token = crypto.randomBytes(32).toString('hex');
    await passwordResets.deleteMany({ userId: user._id }); // pazhaya links ellaam cancel
    await passwordResets.insertOne({ tokenHash: hashToken(token), userId: user._id, expiresAt: new Date(Date.now() + RESET_MS), createdAt: new Date() });
    const link = `${process.env.APP_URL || `http://localhost:${process.env.PORT || 3001}`}/reset-password?token=${token}`;
    await sendEmail({
      to: user.email,
      subject: 'Reset your Flowboard password',
      text: `Hi ${user.name},\n\nClick this link to choose a new password (it works for 1 hour):\n${link}\n\nIf you didn't ask for this, you can ignore this email.`,
    });
  }
  res.json({ ok: true });
});

// 🆕 🔑 RESET PASSWORD: link la vandha token + pudhu password
router.post('/api/auth/reset', userAuthLimit, async (req, res) => {
  const { token, password } = req.body || {};
  if (!isText(token) || !/^[0-9a-f]{64}$/.test(token)) return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
  if (!isText(password) || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const reset = await passwordResets.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
  const user = reset && (await users.findOne({ _id: reset.userId }));
  if (!user || user.disabled) return res.status(400).json({ error: 'This reset link is invalid or has expired.' });

  await users.updateOne({ _id: user._id }, { $set: { passwordHash: await hashPassword(password) } });
  await passwordResets.deleteMany({ userId: user._id }); // oru link oru thadavai thaan
  await userSessions.deleteMany({ userId: user._id }); // 🚪 ellaa devices layum logout (hacker irundhaa veliya)
  await startUserSession(res, user._id);
  console.log('🔑 Password reset:', user.email);
  res.json({ user: publicUser({ ...user, passwordHash: 'set' }) });
});

// 🆕 🔵 GOOGLE LOGIN: Google kuduththa token check panni login / pudhu account
router.post('/api/auth/google', userAuthLimit, async (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(503).json({ error: 'Google sign-in is not set up.' });
  const info = await verifyGoogleToken(req.body?.credential);
  if (!info) return res.status(401).json({ error: 'Google sign-in failed. Please try again.' });

  // Mudhalla Google id la thedu, illana athe email la irukkura account ah link pannu (Google email ah verify pannirukku)
  let user = (await users.findOne({ googleId: info.googleId })) || (await users.findOne({ email: info.email }));
  if (user?.disabled) return res.status(403).json({ error: 'This account has been disabled. Please contact support.' });

  if (user) {
    if (!user.googleId) await users.updateOne({ _id: user._id }, { $set: { googleId: info.googleId } });
  } else {
    const result = await users.insertOne({
      name: info.name,
      email: info.email,
      passwordHash: null, // password illa: Google la mattum login
      googleId: info.googleId,
      avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
      createdAt: new Date(),
    });
    const board = await ensureDefaultBoard(result.insertedId);
    await addStarterTasks(result.insertedId, board._id);
    user = must(await users.findOne({ _id: result.insertedId }), 'User');
    console.log('👤 Pudhu Google user:', info.email);
  }

  await startUserSession(res, user._id);
  res.json({ user: publicUser(user) });
});

export default router;
