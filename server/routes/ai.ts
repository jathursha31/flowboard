import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { PRIORITIES } from '../lib/constants.ts';
import { dayKey, isText } from '../lib/helpers.ts';
import { aiLimit, proAiLimit } from '../lib/rateLimit.ts';
import { planOf } from '../lib/billing.ts';
import type { NextFunction, Request, Response } from 'express';

// 🚦 Real AI ku mattum limit (demo free). 💎 Pro: 100 / mani, Free: 10 / mani
const limitAi = (req: Request, res: Response, next: NextFunction) =>
  !getAnthropic() ? next() : (planOf(req.user) === 'pro' ? proAiLimit : aiLimit)(req, res, next);
import { requireUser } from '../lib/auth.ts';
import { AI_TASKS_SCHEMA, demoSuggestions, getAnthropic } from '../lib/ai.ts';
import { planDayHeuristic } from '../lib/planDay.ts';
import { ASSISTANT_SYSTEM, demoAnswer, gatherTasks } from '../lib/assistant.ts';
import { boards, tasks } from '../db.ts';

// 🤖 AI task suggestions
const router = express.Router();

// 🤖 AI: "Plan a birthday party" maari goal kudutha, Claude tasks suggest pannum
// (Database la save pannaadhu - user "Add" click pannaa dhaan /api/tasks/bulk la save)
router.post('/api/ai/tasks', requireUser, limitAi, async (req, res) => {
  const anthropic = getAnthropic();
  const { goal } = req.body || {};
  if (!isText(goal) || goal.trim().length < 3) return res.status(400).json({ error: 'Describe your goal in a few words.' });

  // 🆕 🎭 Key illana demo templates
  if (!anthropic) {
    return res.json({ tasks: demoSuggestions(goal), demo: true });
  }

  try {
    const response = await anthropic.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      // 🛟 Safety classifier "venaam" sonnaa, Anthropic recommended model la thaane thirumba try pannum
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        effort: 'low', // chinna planning velai: low effort podhum, vegamaa + kammi selavu
        format: { type: 'json_schema', schema: AI_TASKS_SCHEMA }, // 📐 intha JSON shape la mattum badhil
      },
      system:
        'You turn a goal into a short, practical task list for a Kanban board. ' +
        'Return 4 to 10 tasks in a sensible order. Titles are short imperative phrases (max 80 characters). ' +
        'Descriptions are one helpful sentence. dueInDays is how many days from today the task should be done (0 to 60).',
      messages: [{ role: 'user', content: `Goal: ${goal.trim().slice(0, 300)}` }],
    });

    if (response.stop_reason === 'refusal') {
      return res.status(422).json({ error: "The AI couldn't help with that goal. Try describing it differently." });
    }

    const text = response.content.find((b) => b.type === 'text')?.text ?? '{}';
    const parsed = JSON.parse(text);

    // 🧹 AI sonnadhai um nambaama check pannu (max 10, length limits)
    const suggestions = (Array.isArray(parsed.tasks) ? parsed.tasks : []).slice(0, 10).flatMap((t: any) => {
      if (!isText(t.title) || !t.title.trim()) return [];
      const days = Number.isInteger(t.dueInDays) ? Math.min(Math.max(t.dueInDays, 0), 60) : null;
      return [
        {
          title: t.title.trim().slice(0, 80),
          description: isText(t.description) ? t.description.trim().slice(0, 1000) : '',
          priority: PRIORITIES.includes(t.priority) ? t.priority : 'medium',
          dueDate: days === null ? null : dayKey(Date.now() + days * 24 * 60 * 60 * 1000),
        },
      ];
    });

    console.log('🤖 AI suggested', suggestions.length, 'tasks for:', goal.trim().slice(0, 50));
    res.json({ tasks: suggestions, demo: false });
  } catch (err) {
    // Typed SDK errors: rate limit / auth problem / mattha API errors
    if (err instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: 'The AI is busy right now. Please try again in a minute.' });
    }
    if (err instanceof Anthropic.AuthenticationError) {
      console.log('❌ ANTHROPIC_API_KEY thappu!');
      return res.status(503).json({ error: 'AI is not set up correctly.' });
    }
    if (err instanceof Anthropic.APIError) {
      console.log('❌ AI error', err.status, err.message);
      return res.status(502).json({ error: 'The AI request failed. Please try again.' });
    }
    if (err instanceof SyntaxError) {
      return res.status(502).json({ error: 'The AI sent an unexpected answer. Please try again.' });
    }
    throw err;
  }
});

// 🆕 🌅 PLAN MY DAY: ungal boards la irunthu innaikku pannavendiya 3 tasks + kaaranam
const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    picks: {
      type: 'array',
      items: {
        type: 'object',
        properties: { taskId: { type: 'string' }, reason: { type: 'string' } },
        required: ['taskId', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['picks'],
  additionalProperties: false,
};

router.post('/api/ai/plan-day', requireUser, limitAi, async (req, res) => {
  const uid = req.user!._id;
  const myBoards = await boards.find({ $or: [{ userId: uid }, { members: uid }] }).toArray();
  const boardById = new Map(myBoards.map((b) => [String(b._id), b]));

  // ✅ Mudiyaadha tasks: enakku assign aanadhu, illa yaarukkum assign aagaadha
  const open = await tasks
    .find({ boardId: { $in: myBoards.map((b) => b._id) }, $or: [{ assigneeId: uid }, { assigneeId: null }, { assigneeId: { $exists: false } }] })
    .project({ title: 1, priority: 1, dueDate: 1, boardId: 1, column: 1, assigneeId: 1 })
    .toArray();
  const candidates = open
    .filter((t) => t.column !== boardById.get(String(t.boardId))?.columns.at(-1)?.id)
    .slice(0, 80)
    .map((t) => ({
      id: String(t._id),
      title: t.title,
      priority: t.priority ?? 'medium',
      dueDate: t.dueDate ?? null,
      boardId: String(t.boardId),
      boardName: boardById.get(String(t.boardId))?.name ?? '',
      assignedToMe: Boolean(t.assigneeId?.equals?.(uid)),
    }));

  if (!candidates.length) return res.json({ picks: [], demo: !getAnthropic() });

  const anthropic = getAnthropic();
  if (anthropic) {
    try {
      const response = await anthropic.beta.messages.create({
        model: 'claude-opus-5-5',
        max_tokens: 4000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low', format: { type: 'json_schema', schema: PLAN_SCHEMA } },
        system:
          'You help a person plan their day. From their open tasks, pick the 3 they should do today, most important first. ' +
          'Prefer overdue and due-soon work, then high priority, then tasks assigned to them. ' +
          'Each reason is one short, friendly sentence (max 15 words). Only use taskId values from the list.',
        messages: [{ role: 'user', content: `Today is ${dayKey(new Date())}.\nTasks:\n${JSON.stringify(candidates)}` }],
      });
      const text = response.content.find((b) => b.type === 'text')?.text ?? '{}';
      const byId = new Map(candidates.map((c) => [c.id, c]));
      const picks = (JSON.parse(text).picks ?? [])
        .filter((p: { taskId: string }) => byId.has(p.taskId))
        .slice(0, 3)
        .map((p: { taskId: string; reason: unknown }) => ({ task: byId.get(p.taskId), reason: String(p.reason).slice(0, 140) }));
      if (picks.length) return res.json({ picks, demo: false });
    } catch (err) {
      console.log('⚠️ AI plan fail, simple rules use pannurom:', (err as Error).message);
    }
  }

  // 🎭 Key illana / AI fail aanaa: simple rules
  res.json({ picks: planDayHeuristic(candidates), demo: !anthropic });
});

// 🆕 🤖 AI ASSISTANT: "ennoda overdue tasks enna?" maari kelvi → ungal tasks vechu badhil
// history = munnaadi pesinadhu (max 6), adhanaala "avai la edhu mukkiyam?" maari follow-up um puriyum
router.post('/api/ai/assistant', requireUser, limitAi, async (req, res) => {
  const { question, history } = req.body || {};
  if (!isText(question) || !question.trim()) return res.status(400).json({ error: 'Ask a question.' });
  if (question.length > 500) return res.status(400).json({ error: 'Please keep your question under 500 characters.' });
  const past = (Array.isArray(history) ? history : [])
    .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && isText(m.content) && m.content.trim())
    .slice(-6)
    .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: String(m.content).slice(0, 1500) }));
  while (past.length && past[0].role !== 'user') past.shift(); // Claude: mudhal message user odadha irukkanum
  if (past.at(-1)?.role === 'user') past.pop(); // pudhu kelvi user turn: munnaadi user ah irundhaa thookku (maari maari varanum)

  const all = await gatherTasks(req.user!._id);
  const today = dayKey(new Date());
  const anthropic = getAnthropic();
  if (!anthropic) {
    const { answer, tasks: found } = demoAnswer(question, all, today);
    return res.json({ answer, tasks: found, demo: true });
  }

  try {
    const context = all.map((t) => ({ title: t.title, board: t.board, status: t.status, done: t.done, priority: t.priority, due: t.due, assignedToMe: t.mine }));
    const response = await anthropic.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default', // 🛟 safety classifier "venaam" sonnaa recommended model la thirumba
      output_config: { effort: 'low' }, // chinna kelvi-badhil: low effort vegam + kammi selavu
      system: ASSISTANT_SYSTEM,
      messages: [
        ...past,
        { role: 'user', content: `Today is ${today}.\n<tasks>\n${JSON.stringify(context)}\n</tasks>\n\nQuestion: ${question.trim()}` },
      ],
    });
    if (response.stop_reason === 'refusal') {
      return res.status(422).json({ error: "The assistant couldn't answer that. Try asking about your tasks." });
    }
    const answer = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim();
    // 🔗 Badhil la peyar varra tasks ah link aa kaattu (click pannaa task thirakkum)
    const mentioned = all.filter((t) => t.title.length > 2 && answer.includes(t.title)).slice(0, 10);
    res.json({ answer: answer || 'Sorry, I have no answer for that.', tasks: mentioned, demo: false });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'The AI is busy right now. Please try again in a minute.' });
    if (err instanceof Anthropic.AuthenticationError) return res.status(503).json({ error: 'AI is not set up correctly.' });
    if (err instanceof Anthropic.APIError) {
      console.log('❌ AI assistant error', err.status, err.message);
      return res.status(502).json({ error: 'The AI request failed. Please try again.' });
    }
    throw err;
  }
});

export default router;
