import type { Column, Label } from '../types.ts';

// 🗂️ Board templates: "Wedding plan", "Exam prep" maari ready-made boards (columns + labels + tasks)
// tasks: [title, column id, priority, due in days (null = date illa), label ids]

type Row = [title: string, column: string, priority: 'low' | 'medium' | 'high', dueInDays: number | null, labels: string[]];
export interface Template {
  id: string;
  name: string;
  emoji: string;
  description: string;
  columns: Column[];
  labels: Label[];
  tasks: Row[];
}

const BASIC: Column[] = [
  { id: 'todo', title: 'To do' },
  { id: 'doing', title: 'In progress' },
  { id: 'done', title: 'Done' },
];

export const TEMPLATES: Template[] = [
  {
    id: 'wedding',
    name: 'Wedding plan',
    emoji: '💍',
    description: 'Venue, guests, food and the big day, step by step.',
    columns: [
      { id: 'ideas', title: 'Ideas' },
      { id: 'booking', title: 'To book' },
      { id: 'booked', title: 'Booked' },
      { id: 'done', title: 'Done' },
    ],
    labels: [
      { id: 'venue', name: 'venue', color: 'violet' },
      { id: 'food', name: 'food', color: 'orange' },
      { id: 'guests', name: 'guests', color: 'blue' },
      { id: 'budget', name: 'budget', color: 'green' },
    ],
    tasks: [
      ['Set the total budget', 'booking', 'high', 3, ['budget']],
      ['Shortlist 3 wedding halls', 'ideas', 'high', 14, ['venue']],
      ['Book the hall', 'booking', 'high', 30, ['venue', 'budget']],
      ['Make the guest list', 'booking', 'high', 21, ['guests']],
      ['Taste and choose the caterer', 'ideas', 'medium', 45, ['food']],
      ['Order invitation cards', 'booking', 'medium', 60, ['guests']],
      ['Book photographer', 'booking', 'medium', 50, ['budget']],
      ['Buy wedding clothes and jewellery', 'ideas', 'medium', 75, []],
      ['Plan decorations and flowers', 'ideas', 'low', 80, ['venue']],
      ['Confirm final guest count with caterer', 'booking', 'high', 90, ['food', 'guests']],
    ],
  },
  {
    id: 'exam',
    name: 'Exam prep',
    emoji: '📚',
    description: 'Topics, revision, past papers and rest before the exam.',
    columns: [
      { id: 'topics', title: 'Topics' },
      { id: 'studying', title: 'Studying' },
      { id: 'revised', title: 'Revised' },
      { id: 'done', title: 'Exam ready' },
    ],
    labels: [
      { id: 'hard', name: 'hard', color: 'red' },
      { id: 'maths', name: 'maths', color: 'blue' },
      { id: 'science', name: 'science', color: 'green' },
      { id: 'paper', name: 'past paper', color: 'orange' },
    ],
    tasks: [
      ['Collect the syllabus and past papers', 'topics', 'high', 0, []],
      ['Make a day-by-day study timetable', 'topics', 'high', 1, []],
      ['Algebra and equations', 'topics', 'high', 4, ['maths', 'hard']],
      ['Geometry formulas sheet', 'topics', 'medium', 6, ['maths']],
      ['Physics: forces and motion', 'topics', 'high', 8, ['science', 'hard']],
      ['Chemistry: periodic table', 'topics', 'medium', 10, ['science']],
      ['Past paper 1 (timed)', 'topics', 'medium', 12, ['paper']],
      ['Review mistakes from past paper', 'topics', 'medium', 13, ['paper']],
      ['Past paper 2 (timed)', 'topics', 'medium', 16, ['paper']],
      ['Light revision and sleep early', 'topics', 'low', 20, []],
    ],
  },
  {
    id: 'trip',
    name: 'Trip planner',
    emoji: '✈️',
    description: 'Tickets, stay, places to see and what to pack.',
    columns: BASIC,
    labels: [
      { id: 'booking', name: 'booking', color: 'violet' },
      { id: 'money', name: 'money', color: 'green' },
      { id: 'packing', name: 'packing', color: 'cyan' },
    ],
    tasks: [
      ['Choose dates and destination', 'todo', 'high', 1, []],
      ['Set the travel budget', 'todo', 'high', 2, ['money']],
      ['Book tickets', 'todo', 'high', 5, ['booking', 'money']],
      ['Book a place to stay', 'todo', 'medium', 7, ['booking']],
      ['List places to visit each day', 'todo', 'medium', 10, []],
      ['Check passport / ID and documents', 'todo', 'high', 10, []],
      ['Pack clothes, chargers and medicine', 'todo', 'low', 14, ['packing']],
    ],
  },
  {
    id: 'launch',
    name: 'Product launch',
    emoji: '🚀',
    description: 'Build, test, market and launch a product or website.',
    columns: [
      { id: 'backlog', title: 'Backlog' },
      { id: 'doing', title: 'In progress' },
      { id: 'review', title: 'Review' },
      { id: 'done', title: 'Launched' },
    ],
    labels: [
      { id: 'design', name: 'design', color: 'violet' },
      { id: 'bug', name: 'bug', color: 'red' },
      { id: 'feature', name: 'feature', color: 'cyan' },
      { id: 'marketing', name: 'marketing', color: 'pink' },
    ],
    tasks: [
      ['Write the one-line pitch', 'backlog', 'high', 2, ['marketing']],
      ['Design the landing page', 'backlog', 'high', 5, ['design']],
      ['Build sign up and login', 'backlog', 'high', 10, ['feature']],
      ['Build the main feature', 'backlog', 'high', 20, ['feature']],
      ['Test on phone and laptop', 'backlog', 'medium', 24, ['bug']],
      ['Prepare launch posts for social media', 'backlog', 'medium', 26, ['marketing']],
      ['Launch day! 🎉', 'backlog', 'high', 30, ['marketing']],
    ],
  },
  {
    id: 'moving',
    name: 'Moving house',
    emoji: '📦',
    description: 'Packing, transport and address changes.',
    columns: BASIC,
    labels: [
      { id: 'packing', name: 'packing', color: 'orange' },
      { id: 'admin', name: 'admin', color: 'gray' },
    ],
    tasks: [
      ['Pick the moving date', 'todo', 'high', 1, []],
      ['Book a lorry or helpers', 'todo', 'high', 4, []],
      ['Collect boxes and tape', 'todo', 'medium', 5, ['packing']],
      ['Pack room by room (label each box)', 'todo', 'medium', 10, ['packing']],
      ['Update address at bank and work', 'todo', 'low', 14, ['admin']],
    ],
  },
  {
    id: 'weekly',
    name: 'Weekly planner',
    emoji: '🗓️',
    description: 'One column per day, for a calm and simple week.',
    columns: [
      { id: 'mon', title: 'Monday' },
      { id: 'tue', title: 'Tuesday' },
      { id: 'wed', title: 'Wednesday' },
      { id: 'thu', title: 'Thursday' },
      { id: 'fri', title: 'Friday' },
      { id: 'weekend', title: 'Weekend' },
      { id: 'done', title: 'Done' },
    ],
    labels: [
      { id: 'work', name: 'work', color: 'blue' },
      { id: 'home', name: 'home', color: 'green' },
      { id: 'health', name: 'health', color: 'pink' },
    ],
    tasks: [
      ['Plan the week (15 minutes)', 'mon', 'high', null, ['work']],
      ['Exercise 30 minutes', 'tue', 'medium', null, ['health']],
      ['Grocery shopping', 'wed', 'medium', null, ['home']],
      ['Call family', 'weekend', 'low', null, ['home']],
    ],
  },
];

export const templateSummary = (t: Template) => ({ id: t.id, name: t.name, emoji: t.emoji, description: t.description, taskCount: t.tasks.length, columns: t.columns.map((c) => c.title) });
