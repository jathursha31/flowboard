import type { ObjectId, WithId } from 'mongodb';

// 🟦 Database documents oda shape (TypeScript ku: endha field enna type nu)
// [key: string]: unknown illa: theriyaadha field use pannaa TypeScript sollidum

export interface Column {
  id: string;
  title: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Comment {
  id: string;
  text: string;
  author: string;
  createdAt: Date;
}

export interface Attachment {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedAt?: Date;
}

// 🔗 Task la serththa link (Google Drive / Docs / Sheets...)
export interface TaskLink {
  id: string;
  url: string;
  title: string;
  kind: 'drive' | 'docs' | 'sheets' | 'slides' | 'forms' | 'link';
  addedAt: Date;
}

export interface UserDoc {
  name: string;
  email: string;
  passwordHash: string | null; // Google la mattum login na null
  googleId?: string;
  avatarColor?: string;
  disabled?: boolean;
  plan?: 'free' | 'pro'; // 💎 (illana free)
  planStatus?: string; // Stripe subscription status (active, canceled...)
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  calendarToken?: string; // 📅 .ics feed ragasiya link
  createdAt: Date;
}

// 🏷️ Board la neengale create panna label
export interface Label {
  id: string;
  name: string;
  color: string; // LABEL_COLORS la onnu
}

export interface BoardDoc {
  userId: ObjectId | null; // null = public demo board
  name: string;
  columns: Column[];
  members?: ObjectId[];
  viewers?: ObjectId[]; // members la "paakka mattum" aanavanga
  theme?: string;
  labels?: Label[]; // 🏷️ illana DEFAULT_LABELS
  createdAt?: Date;
}

export interface TaskDoc {
  boardId: ObjectId;
  userId: ObjectId | null;
  createdBy?: ObjectId | null;
  title: string;
  priority: 'low' | 'medium' | 'high';
  column: string;
  order: number;
  description?: string;
  dueDate?: string | null;
  labels?: string[];
  checklist?: ChecklistItem[];
  comments?: Comment[];
  attachments?: Attachment[];
  links?: TaskLink[]; // 🔗 Google Drive / Docs / web links
  assigneeId?: ObjectId | null;
  repeat?: 'daily' | 'weekly' | 'monthly' | null;
  completedAt?: Date | null;
  remindedFor?: string;
  timeSpent?: number; // ⏱️ seconds (motham)
  timerStartedAt?: Date | null; // ⏱️ oadikittu irundhaa eppo start
  timerBy?: ObjectId | null; // yaar start pannaanga
  createdAt?: Date;
}

// ⚙️ Site settings: _id = setting peru ('banner')
export interface SettingDoc {
  _id: string;
  text?: string;
  tone?: string;
  active?: boolean;
  updatedAt?: Date;
  publicKey?: string; // 🔔 'vapid' setting
  privateKey?: string;
}

// 🔑 Personal API key: full key save pannave maattom, sha256 hash mattum (password maari)
export interface ApiKeyDoc {
  userId: ObjectId;
  name: string;
  keyHash: string;
  prefix: string; // "fb_ab12cd34" — list la adaiyaalam kaatta
  createdAt: Date;
  lastUsedAt: Date | null;
}

export interface WebhookDelivery {
  at: Date;
  event: string;
  status: number | null; // null = reach aagala (timeout / DNS)
  ok: boolean;
  error?: string;
  ms: number;
}

// 🪝 Webhook: board la maatram nadandhaa intha URL ku POST
export interface WebhookDoc {
  userId: ObjectId; // board owner
  boardId: ObjectId;
  url: string;
  secret: string; // HMAC signature ku (receiver verify pannuvaanga)
  events: string[]; // ['*'] = ellaam
  active: boolean;
  failures: number; // thodarndhu fail aana count (10 aanaa auto off)
  deliveries: WebhookDelivery[]; // kadaisi 10
  createdAt: Date;
}

// 🔔 Oru device (browser) oda push subscription
export interface PushSubscriptionDoc {
  userId: ObjectId;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  createdAt: Date;
}

// 💬 Board chat message
export interface ChatMessageDoc {
  boardId: ObjectId;
  userId: ObjectId;
  name: string; // anuppumbodhu irundha peru
  avatarColor: string;
  text: string;
  createdAt: Date;
}

// 📊 Analytics: oru page view illa oru event (IP save pannave maattom)
export interface AnalyticsDoc {
  type: 'pageview' | 'event';
  name: string | null; // event peru (cta_click...)
  path: string;
  ref: string | null; // enga irunthu vandhaanga (google.com)
  device: 'mobile' | 'tablet' | 'desktop';
  visitor: string; // daily hash
  day: string; // "2026-11-18"
  createdAt: Date;
}

// Database la irunthu padicha documents la _id kandippaa irukkum
export type User = WithId<UserDoc>;
export type Board = WithId<BoardDoc>;
export type Task = WithId<TaskDoc>;
export type ApiKey = WithId<ApiKeyDoc>;
export type Webhook = WithId<WebhookDoc>;
export type ChatMessage = WithId<ChatMessageDoc>;

// 🧩 Express ku: namma loadUser middleware req.user ah set pannum
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User | null;
      apiKey?: ApiKey | null; // 🔑 API key la vandha request (cookie illa)
    }
  }
}
