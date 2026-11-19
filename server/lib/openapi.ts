import { apiKeyAllowed } from './apiKeys.ts';

// 📜 OpenAPI (Swagger) description of the API: /api/docs page la "try it" panna mudiyum
// Chinna helpers vechu ezhudhirukkom, illana 1000 lines aagum

// OpenAPI la ellaame JSON objects: schema / response ku oru loose type podhum
type Json = Record<string, unknown>;
interface OpOptions {
  params?: Json[];
  requestBody?: Json;
  responses?: Record<string, Json>;
  secure?: boolean | 'cookie';
  description?: string;
}

const ref = (name: string): Json => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: Json) => ({ 'application/json': { schema } });
const ok = (schema: Json, description = 'OK'): Json => ({ description, content: json(schema) });
const err = (description: string): Json => ({ description, content: json(ref('Error')) });
const body = (properties: Record<string, Json>, required: string[] = []): Json => ({ required: true, content: json({ type: 'object', properties, required }) });
const idParam = (name: string, where = 'path'): Json => ({ name, in: where, required: where === 'path', schema: { type: 'string' } });
const auth = [{ userCookie: [] }, { apiKey: [] }]; // cookie (website) illa API key (scripts)
const cookieOnly = [{ userCookie: [] }]; // 🔑 API key la seiya mudiyaadhavai
const s = (type: string, extra: Json = {}): Json => ({ type, ...extra });

function op(tag: string, summary: string, { params = [], requestBody, responses, secure = false, description }: OpOptions = {}): Json {
  return {
    tags: [tag],
    summary,
    ...(description && { description }),
    ...(params.length && { parameters: params }),
    ...(requestBody && { requestBody }),
    ...(secure && { security: secure === 'cookie' ? cookieOnly : auth }),
    responses: responses ?? { 200: ok(ref('Ok')) },
  };
}

const taskFields = {
  title: s('string', { maxLength: 80 }),
  priority: s('string', { enum: ['low', 'medium', 'high'] }),
  description: s('string', { maxLength: 1000 }),
  dueDate: s('string', { format: 'date', nullable: true }),
  labels: s('array', { items: s('string', { enum: ['design', 'bug', 'feature', 'urgent'] }) }),
  checklist: s('array', { items: ref('ChecklistItem') }),
  repeat: s('string', { enum: ['daily', 'weekly', 'monthly'], nullable: true }),
  assigneeId: s('string', { nullable: true }),
  column: s('string'),
};

export const openApiSpec: { paths: Record<string, Record<string, Json>>; [key: string]: unknown } = {
  openapi: '3.0.3',
  info: {
    title: 'Flowboard API',
    version: '1.0.0',
    description:
      'REST API behind Flowboard. Log in with `POST /api/auth/login` first: the browser keeps the `user_token` cookie, so "Try it out" works for protected endpoints too.\n\n' +
      '**Scripts and other apps:** create a personal API key on your Account page and send it as `Authorization: Bearer fb_...` (120 requests per minute per key). ' +
      'API keys can read and change boards and tasks, but cannot log in, change your account or manage keys and webhooks.\n\n' +
      '**Webhooks:** board owners can add an https URL that gets a POST for every task change. Each POST has `X-Flowboard-Signature: t=<unix time>,v1=<hex>`, ' +
      'where v1 = HMAC-SHA256(secret, "<t>.<raw body>"). Reject the request if the signature does not match or t is more than 5 minutes old.',
  },
  servers: [{ url: '/' }],
  tags: ['Auth', 'Account', 'Boards', 'Tasks', 'Attachments', 'Realtime', 'Notifications', 'Search', 'AI', 'Chat', 'Developer', 'Analytics', 'Billing', 'Push', 'Public'].map((name) => ({ name })),
  components: {
    securitySchemes: { userCookie: { type: 'apiKey', in: 'cookie', name: 'user_token' }, apiKey: { type: 'http', scheme: 'bearer', description: 'Personal API key (fb_...) from your Account page' } },
    schemas: {
      Error: s('object', { properties: { error: s('string') } }),
      Ok: s('object', { properties: { ok: s('boolean') } }),
      ChatMessage: s('object', { properties: { id: s('string'), userId: s('string'), name: s('string'), avatarColor: s('string'), text: s('string'), createdAt: s('string', { format: 'date-time' }), mine: s('boolean'), canDelete: s('boolean') } }),
      ApiKey: s('object', { properties: { id: s('string'), name: s('string'), prefix: s('string'), createdAt: s('string', { format: 'date-time' }), lastUsedAt: s('string', { format: 'date-time', nullable: true }) } }),
      WebhookDelivery: s('object', { properties: { at: s('string', { format: 'date-time' }), event: s('string'), status: s('integer', { nullable: true }), ok: s('boolean'), error: s('string'), ms: s('integer') } }),
      Webhook: s('object', {
        properties: {
          id: s('string'),
          boardId: s('string'),
          url: s('string'),
          events: s('array', { items: s('string') }),
          active: s('boolean'),
          failures: s('integer'),
          deliveries: s('array', { items: ref('WebhookDelivery') }),
        },
      }),
      User: s('object', { properties: { name: s('string'), email: s('string'), avatarColor: s('string'), hasPassword: s('boolean') } }),
      ChecklistItem: s('object', { properties: { id: s('string'), text: s('string'), done: s('boolean') }, required: ['id', 'text', 'done'] }),
      Attachment: s('object', { properties: { id: s('string'), name: s('string'), size: s('integer'), type: s('string') } }),
      Comment: s('object', { properties: { id: s('string'), text: s('string'), author: s('string'), createdAt: s('string', { format: 'date-time' }) } }),
      Task: s('object', {
        properties: {
          id: s('string'),
          ...taskFields,
          order: s('number'),
          comments: s('array', { items: ref('Comment') }),
          attachments: s('array', { items: ref('Attachment') }),
        },
      }),
      Board: s('object', {
        properties: {
          id: s('string'),
          name: s('string'),
          columns: s('array', { items: s('object', { properties: { id: s('string'), title: s('string') } }) }),
          theme: s('string', { enum: ['default', 'ocean', 'forest', 'sunset', 'berry', 'slate'] }),
          labels: s('array', { items: s('object', { properties: { id: s('string'), name: s('string'), color: s('string', { enum: ['violet', 'red', 'cyan', 'orange', 'green', 'blue', 'pink', 'gray'] }) } }) }),
          role: s('string', { enum: ['owner', 'member'] }),
          access: s('string', { enum: ['owner', 'editor', 'viewer'], description: 'viewer = read-only' }),
          ownerName: s('string', { nullable: true }),
          memberCount: s('integer'),
        },
      }),
      Person: s('object', { properties: { id: s('string'), name: s('string'), email: s('string'), avatarColor: s('string') } }),
      Members: s('object', { properties: { owner: ref('Person'), members: s('array', { items: ref('Person') }) } }),
      Notification: s('object', {
        properties: { id: s('string'), type: s('string'), text: s('string'), boardId: s('string'), taskId: s('string'), read: s('boolean'), createdAt: s('string') },
      }),
      Activity: s('object', { properties: { id: s('string'), taskId: s('string'), taskTitle: s('string'), actorName: s('string'), action: s('string', { enum: ['created', 'edited', 'moved', 'completed', 'assigned', 'commented', 'attached', 'deleted'] }), detail: s('string'), createdAt: s('string', { format: 'date-time' }) } }),
      Suggestion: s('object', { properties: { title: s('string'), description: s('string'), priority: s('string'), dueDate: s('string') } }),
    },
  },
  paths: {
    '/api/auth/signup': {
      post: op('Auth', 'Create an account', {
        requestBody: body({ name: s('string'), email: s('string'), password: s('string', { minLength: 8 }) }, ['name', 'email', 'password']),
        responses: { 201: ok(s('object', { properties: { user: ref('User') } }), 'Created and logged in'), 400: err('Invalid input'), 409: err('Email already used'), 429: err('Too many attempts') },
      }),
    },
    '/api/auth/login': {
      post: op('Auth', 'Log in', {
        requestBody: body({ email: s('string'), password: s('string') }, ['email', 'password']),
        responses: { 200: ok(s('object', { properties: { user: ref('User') } })), 401: err('Wrong email or password'), 403: err('Account disabled'), 429: err('Too many attempts') },
      }),
    },
    '/api/auth/logout': { post: op('Auth', 'Log out') },
    '/api/auth/me': { get: op('Auth', 'Who is logged in', { responses: { 200: ok(s('object', { properties: { user: { ...ref('User'), nullable: true } } })) } }) },
    '/api/auth/forgot': {
      post: op('Auth', 'Email a password reset link', { requestBody: body({ email: s('string') }, ['email']), description: 'Always answers `{ ok: true }` so nobody can test which emails have accounts.' }),
    },
    '/api/auth/reset': {
      post: op('Auth', 'Set a new password with a reset token', {
        requestBody: body({ token: s('string'), password: s('string') }, ['token', 'password']),
        responses: { 200: ok(s('object', { properties: { user: ref('User') } })), 400: err('Invalid or expired link') },
      }),
    },
    '/api/auth/google': {
      post: op('Auth', 'Sign in with a Google ID token', {
        requestBody: body({ credential: s('string') }, ['credential']),
        responses: { 200: ok(s('object', { properties: { user: ref('User') } })), 401: err('Token rejected'), 503: err('Google sign-in not configured') },
      }),
    },
    '/api/config': { get: op('Public', 'Optional features that are switched on', { responses: { 200: ok(s('object', { properties: { googleClientId: s('string', { nullable: true }), emailEnabled: s('boolean') } })) } }) },

    '/api/account': {
      patch: op('Account', 'Change name or avatar colour', { secure: true, requestBody: body({ name: s('string'), avatarColor: s('string') }), responses: { 200: ok(s('object', { properties: { user: ref('User') } })), 400: err('Invalid input') } }),
      delete: op('Account', 'Delete my account and all my boards', { secure: true, requestBody: body({ password: s('string'), confirmEmail: s('string', { description: 'For Google accounts without a password' }) }), responses: { 200: ok(ref('Ok')), 401: err('Wrong password / email') } }),
    },
    '/api/account/password': { post: op('Account', 'Change (or first set) my password', { secure: true, requestBody: body({ currentPassword: s('string'), newPassword: s('string', { minLength: 8 }) }, ['newPassword']) }) },
    '/api/account/stats': { get: op('Account', 'My stats: done this week, streak, overdue…', { secure: true, responses: { 200: ok(s('object')) } }) },
    '/api/account/messages': { get: op('Account', 'Messages I sent while logged in, with admin replies', { secure: true, responses: { 200: ok(s('array', { items: s('object') })) } }) },

    '/api/boards': {
      get: op('Boards', 'My boards and boards shared with me', { responses: { 200: ok(s('array', { items: ref('Board') })) } }),
      post: op('Boards', 'Create a board (optionally from a template: GET /api/templates)', { secure: true, requestBody: body({ name: s('string', { maxLength: 40 }), template: s('string', { example: 'wedding' }) }), responses: { 201: ok(ref('Board')), 400: err('Invalid name / too many boards') } }),
    },
    '/api/boards/{id}': {
      patch: op('Boards', 'Rename, change columns or theme (owner only)', {
        secure: true,
        params: [idParam('id')],
        requestBody: body({ name: s('string'), theme: s('string'), columns: s('array', { items: s('object', { properties: { id: s('string'), title: s('string') } }) }) }),
        responses: { 200: ok(ref('Board')), 400: err('Invalid input'), 404: err('Not found or not the owner') },
      }),
      delete: op('Boards', 'Delete a board and its tasks (owner only)', { secure: true, params: [idParam('id')] }),
    },
    '/api/boards/{id}/members': {
      get: op('Boards', 'Owner and members', { secure: true, params: [idParam('id')], responses: { 200: ok(ref('Members')) } }),
      post: op('Boards', 'Invite someone by email as editor or viewer (owner only)', { secure: true, params: [idParam('id')], requestBody: body({ email: s('string'), role: s('string', { enum: ['editor', 'viewer'], default: 'editor' }) }, ['email']), responses: { 200: ok(ref('Members')), 404: err('No such account') } }),
    },
    '/api/boards/{id}/activity': {
      get: op('Boards', 'History: who did what (optionally for one task)', { params: [idParam('id'), idParam('taskId', 'query')], responses: { 200: ok(s('array', { items: ref('Activity') })) } }),
    },
    '/api/boards/{id}/members/{userId}': {
      patch: op('Boards', 'Change a member role: editor ↔ viewer (owner only)', { secure: true, params: [idParam('id'), idParam('userId')], requestBody: body({ role: s('string', { enum: ['editor', 'viewer'] }) }, ['role']), responses: { 200: ok(ref('Members')), 404: err('Not on this board') } }),
      delete: op('Boards', 'Remove a member, or leave with userId = "me"', { secure: true, params: [idParam('id'), idParam('userId')], responses: { 200: ok(ref('Members')) } }),
    },

    '/api/tasks': {
      get: op('Tasks', "A board's tasks", { params: [idParam('boardId', 'query')], responses: { 200: ok(s('array', { items: ref('Task') })), 404: err('Board not found') } }),
      post: op('Tasks', 'Create a task', { requestBody: body({ boardId: s('string'), ...taskFields }, ['title']), responses: { 201: ok(ref('Task')), 400: err('Invalid input') } }),
    },
    '/api/tasks/bulk': { post: op('Tasks', 'Create 1–15 tasks at once (AI "Add all")', { secure: true, requestBody: body({ boardId: s('string'), tasks: s('array', { items: s('object') }) }, ['tasks']), responses: { 201: ok(s('array', { items: ref('Task') })) } }) },
    '/api/tasks/{id}': {
      patch: op('Tasks', 'Update any task field', { params: [idParam('id')], requestBody: body(taskFields), responses: { 200: ok(ref('Task')), 400: err('Invalid input'), 404: err('Not found') } }),
      delete: op('Tasks', 'Delete a task (and its files)', { params: [idParam('id')] }),
    },
    '/api/tasks/reorder': {
      post: op('Tasks', 'Save the order of a column after drag & drop', {
        requestBody: body({ boardId: s('string'), column: s('string'), ids: s('array', { items: s('string') }), movedId: s('string') }, ['column', 'ids']),
        responses: { 200: ok(s('object', { properties: { ok: s('boolean'), repeated: s('integer', { description: 'New copies created by repeating tasks' }) } })) },
      }),
    },
    '/api/tasks/{id}/comments': { post: op('Tasks', 'Add a comment', { params: [idParam('id')], requestBody: body({ text: s('string') }, ['text']), responses: { 201: ok(ref('Task')) } }) },
    '/api/tasks/{id}/comments/{commentId}': { delete: op('Tasks', 'Delete a comment', { params: [idParam('id'), idParam('commentId')], responses: { 200: ok(ref('Task')) } }) },
    '/api/tasks/reset': { post: op('Tasks', 'Reset a board to the starter tasks (owner only)', { requestBody: body({ boardId: s('string') }) }) },

    '/api/tasks/{id}/attachments': {
      post: op('Attachments', 'Upload a file (raw body, up to 2 MB)', {
        secure: true,
        params: [idParam('id'), { name: 'X-File-Name', in: 'header', schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'image/png': { schema: s('string', { format: 'binary' }) }, 'application/pdf': { schema: s('string', { format: 'binary' }) } } },
        responses: { 201: ok(ref('Task')), 413: err('Too big'), 415: err('Type not allowed') },
      }),
    },
    '/api/tasks/{id}/attachments/{fileId}': { delete: op('Attachments', 'Delete a file', { secure: true, params: [idParam('id'), idParam('fileId')], responses: { 200: ok(ref('Task')) } }) },
    '/api/attachments/{fileId}': { get: op('Attachments', 'Download a file (board access needed)', { params: [idParam('fileId')], responses: { 200: { description: 'The file' }, 404: err('Not found') } }) },

    '/api/boards/{id}/events': {
      get: op('Realtime', 'Live updates for a board (Server-Sent Events)', {
        params: [idParam('id')],
        description: 'Keeps the connection open and sends `data: {"type":"tasks"|"board","by":"<client id>"}` whenever the board changes.',
        responses: { 200: { description: 'text/event-stream' }, 404: err('Board not found') },
      }),
    },
    '/api/notifications': { get: op('Notifications', 'My latest 30 notifications + unread count', { secure: true, responses: { 200: ok(s('object', { properties: { unread: s('integer'), items: s('array', { items: ref('Notification') }) } })) } }) },
    '/api/notifications/read-all': { post: op('Notifications', 'Mark all as read', { secure: true }) },
    '/api/notifications/{id}/read': { post: op('Notifications', 'Mark one as read', { secure: true, params: [idParam('id')] }) },
    '/api/search': { get: op('Search', 'Search my boards and tasks (Ctrl + K)', { params: [{ name: 'q', in: 'query', schema: { type: 'string' } }], responses: { 200: ok(s('object')) } }) },
    '/api/ai/plan-day': {
      post: op('AI', 'Pick the 3 tasks to do today, with reasons', { secure: true, responses: { 200: ok(s('object', { properties: { picks: s('array', { items: s('object', { properties: { task: s('object'), reason: s('string') } }) }), demo: s('boolean') } })) } }),
    },
    '/api/ai/assistant': {
      post: op('AI', 'Ask about my tasks ("what is overdue?"); demo answers without an AI key', {
        secure: true,
        requestBody: body({ question: s('string', { maxLength: 500 }), history: s('array', { items: s('object', { properties: { role: s('string', { enum: ['user', 'assistant'] }), content: s('string') } }) }) }, ['question']),
        responses: { 200: ok(s('object', { properties: { answer: s('string'), tasks: s('array', { items: s('object') }), demo: s('boolean') } })), 400: err('Empty or too long') },
      }),
    },
    '/api/ai/tasks': { post: op('AI', 'Suggest tasks for a goal', { secure: true, requestBody: body({ goal: s('string') }, ['goal']), responses: { 200: ok(s('object', { properties: { tasks: s('array', { items: ref('Suggestion') }), demo: s('boolean') } })) } }) },

    '/api/account/export': { get: op('Account', 'Download all my boards and tasks (JSON backup)', { secure: true, responses: { 200: ok(s('object')) } }) },
    '/api/boards/{id}/export.csv': { get: op('Boards', 'Download a board as CSV', { params: [idParam('id')], responses: { 200: { description: 'text/csv' } } }) },
    '/api/import': { post: op('Account', 'Import a Flowboard backup or a Trello JSON export (up to 5 MB)', { secure: true, requestBody: body({ boards: s('array', { items: s('object') }), lists: s('array', { items: s('object') }), cards: s('array', { items: s('object') }) }), responses: { 201: ok(s('object', { properties: { format: s('string'), boards: s('array', { items: s('object') }) } })), 400: err('Unknown or invalid file') } }) },
    '/api/boards/{id}/chat': {
      get: op('Chat', 'Latest 50 chat messages, oldest first (?before=<id> for older)', { secure: true, params: [idParam('id'), idParam('before', 'query')], responses: { 200: ok(s('object', { properties: { messages: s('array', { items: ref('ChatMessage') }), hasMore: s('boolean') } })), 404: err('Board not found') } }),
      post: op('Chat', 'Send a message (@Name notifies a board member)', { secure: true, params: [idParam('id')], requestBody: body({ text: s('string', { maxLength: 1000 }) }, ['text']), responses: { 201: ok(ref('ChatMessage')), 400: err('Empty or too long'), 429: err('Too fast') } }),
    },
    '/api/chat/{id}': { delete: op('Chat', 'Delete my message (board owners can delete any)', { secure: true, params: [idParam('id')], responses: { 200: ok(ref('Ok')), 403: err('Not yours'), 404: err('Not found') } }) },
    '/api/billing': { get: op('Billing', 'My plan (free / pro), whether payments are on, and plan limits', { secure: true, responses: { 200: ok(s('object', { properties: { enabled: s('boolean'), plan: s('string', { enum: ['free', 'pro'] }), status: s('string', { nullable: true }), canManage: s('boolean'), limits: s('object') } })) } }) },
    '/api/billing/checkout': { post: op('Billing', 'Start a Stripe Checkout for Pro (returns the payment page URL)', { secure: true, responses: { 200: ok(s('object', { properties: { url: s('string') } })), 503: err('Payments not set up') } }) },
    '/api/billing/portal': { post: op('Billing', 'Open the Stripe billing portal (change card, cancel)', { secure: true, responses: { 200: ok(s('object', { properties: { url: s('string') } })), 400: err('No billing account yet'), 503: err('Payments not set up') } }) },
    '/api/billing/webhook': { post: op('Billing', 'Stripe webhook (signed with Stripe-Signature; not for direct use)', { responses: { 200: ok(s('object', { properties: { received: s('boolean') } })), 400: err('Invalid signature') } }) },
    '/api/push/key': { get: op('Push', 'Public VAPID key for subscribing a browser', { responses: { 200: ok(s('object', { properties: { publicKey: s('string') } })) } }) },
    '/api/push/status': { get: op('Push', 'How many of my devices get alerts', { secure: true, responses: { 200: ok(s('object', { properties: { devices: s('integer') } })) } }) },
    '/api/push/subscribe': { post: op('Push', 'Get alerts on this device (browser PushSubscription JSON)', { secure: true, requestBody: body({ endpoint: s('string'), keys: s('object', { properties: { p256dh: s('string'), auth: s('string') } }) }, ['endpoint', 'keys']), responses: { 201: ok(ref('Ok')), 400: err('Invalid subscription') } }) },
    '/api/push/unsubscribe': { post: op('Push', 'Stop alerts on this device', { secure: true, requestBody: body({ endpoint: s('string') }, ['endpoint']) }) },
    '/api/push/test': { post: op('Push', 'Send a test alert to my devices', { secure: true, responses: { 200: ok(s('object', { properties: { sent: s('integer') } })) } }) },
    '/api/account/calendar': { get: op('Account', 'My private calendar feed URL (.ics) for Google / Apple / Outlook Calendar', { secure: true, responses: { 200: ok(s('object', { properties: { url: s('string') } })) } }) },
    '/api/account/calendar/reset': { post: op('Account', 'Make a new calendar link (the old one stops working)', { secure: true, responses: { 200: ok(s('object', { properties: { url: s('string') } })) } }) },
    '/api/calendar/{token}.ics': { get: op('Account', 'Calendar feed of tasks with due dates (the token is the password)', { params: [idParam('token')], responses: { 200: { description: 'text/calendar' }, 404: { description: 'Unknown link' } } }) },
    '/api/templates': { get: op('Boards', 'Ready-made board templates (Wedding plan, Exam prep...)', { responses: { 200: ok(s('array', { items: s('object', { properties: { id: s('string'), name: s('string'), emoji: s('string'), description: s('string'), taskCount: s('integer') } }) })) } }) },
    '/api/tasks/{id}/timer': { post: op('Tasks', 'Time tracking: start, stop or reset the timer (one running timer per person)', { secure: true, params: [idParam('id')], requestBody: body({ action: s('string', { enum: ['start', 'stop', 'reset'] }) }, ['action']), responses: { 200: ok(ref('Task')), 409: err('Already running / not running') } }) },
    '/api/account/report': { get: op('Account', 'Progress report for the last 7 or 30 days', { secure: true, params: [{ name: 'days', in: 'query', schema: { type: 'string', enum: ['7', '30'] } }], responses: { 200: ok(s('object')) } }) },
    '/api/tasks/{id}/links': { post: op('Tasks', 'Add a Google Drive / Docs / Sheets / Slides (or any https) link', { params: [idParam('id')], requestBody: body({ url: s('string', { example: 'https://docs.google.com/document/d/abc/edit' }), title: s('string') }, ['url']), responses: { 201: ok(ref('Task')), 400: err('Not an https link / too many') } }) },
    '/api/tasks/{id}/links/{linkId}': { delete: op('Tasks', 'Remove a link', { params: [idParam('id'), idParam('linkId')], responses: { 200: ok(ref('Task')) } }) },
    '/api/track': {
      post: op('Analytics', 'Count a page view or event (no cookies; ignored with Do Not Track)', {
        requestBody: body({ type: s('string', { enum: ['pageview', 'event'] }), path: s('string', { example: '/pricing' }), referrer: s('string'), name: s('string', { enum: ['cta_click', 'signup', 'login', 'task_created', 'chat_sent', 'ai_used', 'install_app', 'pricing_click'] }) }, ['type', 'path']),
        responses: { 204: { description: 'Counted (or skipped)' }, 400: err('Invalid event') },
      }),
    },
    '/api/keys': {
      get: op('Developer', 'My API keys (prefix only, never the full key)', { secure: 'cookie', responses: { 200: ok(s('array', { items: ref('ApiKey') })) } }),
      post: op('Developer', 'Create an API key (the full key is shown only once)', { secure: 'cookie', requestBody: body({ name: s('string', { maxLength: 40 }) }, ['name']), responses: { 201: ok(s('object', { properties: { key: s('string', { example: 'fb_...' }) }, allOf: [ref('ApiKey')] })) } }),
    },
    '/api/keys/{id}': { delete: op('Developer', 'Revoke an API key', { secure: 'cookie', params: [idParam('id')], responses: { 200: ok(ref('Ok')), 404: err('Not found') } }) },
    '/api/boards/{id}/webhooks': {
      get: op('Developer', 'Webhooks on my board (owner only)', { secure: 'cookie', params: [idParam('id')], responses: { 200: ok(s('object', { properties: { events: s('array', { items: s('string') }), webhooks: s('array', { items: ref('Webhook') }) } })) } }),
      post: op('Developer', 'Add a webhook (the signing secret is shown only once)', {
        secure: 'cookie',
        params: [idParam('id')],
        requestBody: body({ url: s('string', { example: 'https://example.com/flowboard-hook' }), events: s('array', { items: s('string', { enum: ['*', 'task.created', 'task.edited', 'task.moved', 'task.completed', 'task.assigned', 'task.commented', 'task.attached', 'task.deleted'] }) }) }, ['url']),
        responses: { 201: ok(s('object', { properties: { secret: s('string') }, allOf: [ref('Webhook')] })), 400: err('Bad URL or events') },
      }),
    },
    '/api/webhooks/{id}': {
      patch: op('Developer', 'Turn a webhook on/off or change its events', { secure: 'cookie', params: [idParam('id')], requestBody: body({ active: s('boolean'), events: s('array', { items: s('string') }) }), responses: { 200: ok(ref('Webhook')) } }),
      delete: op('Developer', 'Delete a webhook', { secure: 'cookie', params: [idParam('id')] }),
    },
    '/api/webhooks/{id}/test': { post: op('Developer', 'Send a test "ping" and see the result', { secure: 'cookie', params: [idParam('id')], responses: { 200: ok(ref('WebhookDelivery')) } }) },
    '/api/contact': { post: op('Public', 'Send a contact message', { requestBody: body({ name: s('string'), email: s('string'), team: s('string'), message: s('string') }, ['name', 'email', 'message']) }) },
    '/api/reviews': {
      get: op('Public', 'Approved reviews', { responses: { 200: ok(s('array', { items: s('object') })) } }),
      post: op('Public', 'Write or edit my review (goes back to pending)', { secure: true, requestBody: body({ rating: s('integer', { minimum: 1, maximum: 5 }), text: s('string'), role: s('string') }, ['rating', 'text']) }),
    },
    '/api/reviews/mine': { get: op('Public', 'My review and whether it is approved', { secure: true, responses: { 200: ok(s('object')) } }) },
    '/api/updates': { get: op('Public', 'Latest "What\'s new" posts', { responses: { 200: ok(s('array', { items: s('object') })) } }) },
    '/api/health': { get: op('Public', 'Is the server up? (database ping)', { responses: { 200: ok(s('object', { properties: { status: s('string'), uptimeSeconds: s('integer'), database: s('object'), version: s('string') } })), 503: { description: 'Database down' } } }) },
    '/api/banner': { get: op('Public', 'Current site banner', { responses: { 200: ok(s('object')) } }) },
  },
};

// 🔑 API key la block aana paths (account, auth, keys, webhooks) ku docs la "cookie mattum" nu kaattu
for (const [path, ops] of Object.entries(openApiSpec.paths)) {
  if (apiKeyAllowed(path.replace(/^\/api/, '').replace(/\{(\w+)\}/g, 'x'))) continue;
  for (const operation of Object.values(ops)) if (operation.security) operation.security = cookieOnly;
}
