import Anthropic from '@anthropic-ai/sdk';
import { PRIORITIES } from './constants.ts';
import { dayKey } from './helpers.ts';

// 🤖 AI task generator: Claude client + demo templates (API key illaadhapodhu)

// 🆕 🤖 Claude client: .env la ANTHROPIC_API_KEY irundhaa mattum (illana AI feature off)
// (Lazy: .env load aana apram thaan key ah paakkanum, mudhal thadavai use pannumbodhu create)
let anthropicClient: Anthropic | null | undefined;
export function getAnthropic(): Anthropic | null {
  if (anthropicClient === undefined) anthropicClient = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
  return anthropicClient;
}

// 🆕 🤖 AI kitta "intha JSON shape la mattum badhil sollu" nu solra schema
export const AI_TASKS_SCHEMA = {
  type: 'object',
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          priority: { type: 'string', enum: PRIORITIES },
          dueInDays: { type: 'integer' },
        },
        required: ['title', 'description', 'priority', 'dueInDays'],
        additionalProperties: false,
      },
    },
  },
  required: ['tasks'],
  additionalProperties: false,
};

// 🆕 🎭 DEMO MODE: API key illaadhapodhu, ready-made templates (free, AI illa)
// Goal la irukkura keyword paathu correct template edukkum
export const DEMO_TEMPLATES = [
  {
    keywords: ['birthday', 'party', 'celebrat'],
    tasks: [
      ['Set a date and budget', 'Pick the day and decide how much you can spend.', 'high', 1],
      ['Make the guest list', 'Write down everyone you want to invite.', 'high', 2],
      ['Book the venue', 'Reserve a place, or prepare your home.', 'medium', 5],
      ['Send invitations', 'Message or call guests with the date, time and place.', 'medium', 6],
      ['Order the cake', 'Choose a flavour and order a few days early.', 'medium', 10],
      ['Plan food and drinks', 'Decide the menu and buy or order everything.', 'medium', 11],
      ['Buy decorations', 'Balloons, banners, candles and lights.', 'low', 12],
    ],
  },
  {
    keywords: ['exam', 'study', 'test', 'revision', 'revise'],
    tasks: [
      ['List every exam topic', 'Collect the syllabus and past papers.', 'high', 0],
      ['Make a study timetable', 'Split topics across the days you have left.', 'high', 1],
      ['Revise the hardest topic first', 'Start where you are weakest.', 'high', 3],
      ['Do one past paper', 'Time yourself like the real exam.', 'medium', 7],
      ['Review mistakes', 'Note why you got questions wrong and fix them.', 'medium', 8],
      ['Final quick revision', 'Skim notes and formulas, then rest well.', 'low', 13],
    ],
  },
  {
    keywords: ['trip', 'travel', 'vacation', 'holiday', 'tour'],
    tasks: [
      ['Choose dates and destination', 'Decide where and when you are going.', 'high', 1],
      ['Set a travel budget', 'Transport, stay, food and activities.', 'high', 2],
      ['Book transport', 'Bus, train or flight tickets.', 'high', 5],
      ['Book a place to stay', 'Hotel, guest house or relatives.', 'medium', 7],
      ['Plan the daily itinerary', 'List places to visit each day.', 'medium', 10],
      ['Pack your bag', 'Clothes, documents, chargers and medicine.', 'low', 14],
    ],
  },
  {
    keywords: ['shop', 'store', 'business', 'sell', 'startup'],
    tasks: [
      ['Pick your products', 'Decide what you will sell and to whom.', 'high', 2],
      ['Check prices and costs', 'Work out cost, price and profit per item.', 'high', 4],
      ['Choose where to sell', 'Online page, marketplace or physical stall.', 'medium', 7],
      ['Take product photos', 'Clear photos with good light.', 'medium', 9],
      ['Set up payments', 'Bank transfer, cash on delivery or card.', 'medium', 12],
      ['Announce the launch', 'Post on social media and tell friends.', 'low', 14],
    ],
  },
  {
    keywords: ['website', 'app', 'portfolio', 'project', 'code'],
    tasks: [
      ['Write down the main goal', 'Who is it for and what should it do?', 'high', 1],
      ['Sketch the pages', 'Draw a simple layout for each screen.', 'high', 3],
      ['Build the first version', 'Get the core feature working end to end.', 'high', 10],
      ['Test on phone and laptop', 'Fix layout and bugs you find.', 'medium', 14],
      ['Deploy it online', 'Put it on the internet and share the link.', 'medium', 17],
      ['Collect feedback', 'Ask 3 people to try it and note their comments.', 'low', 21],
    ],
  },
  {
    keywords: ['job', 'interview', 'cv', 'resume', 'career'],
    tasks: [
      ['Update your CV', 'Add recent projects and skills.', 'high', 2],
      ['Polish your GitHub / portfolio', 'Pin your best projects with good READMEs.', 'high', 4],
      ['List companies to apply to', 'Aim for 10 that match your skills.', 'medium', 5],
      ['Apply to 3 jobs', 'Tailor each application a little.', 'medium', 7],
      ['Practise interview questions', 'Explain your projects out loud.', 'medium', 9],
    ],
  },
  {
    keywords: ['move', 'moving', 'house', 'shift', 'relocat'],
    tasks: [
      ['Pick a moving date', 'Confirm the date with everyone involved.', 'high', 1],
      ['Book transport', 'Lorry, van or helpers.', 'high', 4],
      ['Collect boxes', 'Get boxes, tape and markers.', 'medium', 5],
      ['Pack room by room', 'Label each box with the room name.', 'medium', 10],
      ['Update your address', 'Bank, work and delivery apps.', 'low', 14],
    ],
  },
];

type Row = [title: string, description: string, priority: string, dueInDays: number];

export function demoSuggestions(goal: string) {
  const text = goal.toLowerCase();
  const template = DEMO_TEMPLATES.find((t) => t.keywords.some((k) => text.includes(k)));
  const short = goal.trim().slice(0, 50);
  const rows: Row[] = template
    ? (template.tasks as Row[])
    : [
        // Theriyaadha goal: general plan
        [`Define what "done" means for: ${short}`, 'Write one sentence describing the finished result.', 'high', 1],
        ['Gather what you need', 'Information, tools, money or people.', 'high', 3],
        ['Break it into small steps', 'Each step should take less than a day.', 'medium', 4],
        ['Do the first step', 'Start with the easiest one to build momentum.', 'medium', 5],
        ['Review progress', 'Check what worked and adjust the plan.', 'low', 10],
        ['Finish and celebrate', 'Wrap up the last steps and mark it done.', 'low', 14],
      ];
  return rows.map(([title, description, priority, days]) => ({
    title,
    description,
    priority,
    dueDate: dayKey(Date.now() + days * 24 * 60 * 60 * 1000),
  }));
}
