import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import TaskModal from '../components/TaskModal.tsx';
import TaskTimer from '../components/TaskTimer.tsx';
import TemplatePicker from '../components/TemplatePicker.tsx';
import ReportsPage from '../pages/ReportsPage.tsx';
import { AuthProvider } from '../context/AuthContext.tsx';
import { LanguageProvider } from '../context/LanguageContext.tsx';
import { ToastProvider } from '../context/ToastContext.tsx';
import { formatDuration, totalSeconds } from '../utils/duration.ts';
import { fakeFetch } from './fakeFetch.ts';
import type { Task } from '../types.ts';

// 🏷️ labels, ⏱️ timer, 🗂️ templates, 📊 reports

afterEach(() => vi.unstubAllGlobals());

const task: Task = {
  id: 't1', title: 'Logo', description: '', priority: 'medium', dueDate: null, labels: ['client-a'], checklist: [],
  comments: [], attachments: [], repeat: null, assigneeId: null, column: 'todo', order: 0, timeSpent: 0, timerStartedAt: null,
};
const wrap = (ui: React.ReactNode) => (
  <LanguageProvider>
    <ToastProvider>{ui}</ToastProvider>
  </LanguageProvider>
);

describe('duration helpers', () => {
  it('formats seconds and adds a running timer', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(125)).toBe('2m 05s');
    expect(formatDuration(3900)).toBe('1h 05m');
    const now = Date.parse('2026-11-19T10:00:30Z');
    expect(totalSeconds({ timeSpent: 60, timerStartedAt: '2026-11-19T10:00:00Z' }, now)).toBe(90);
  });
});

describe('custom labels in the task popup', () => {
  it('shows the board labels and saves label ids', async () => {
    const onSave = vi.fn(async () => {});
    const user = userEvent.setup();
    const labels = [
      { id: 'client-a', name: 'Client A', color: 'green' },
      { id: 'blocked', name: 'Blocked', color: 'red' },
    ];
    render(wrap(<TaskModal task={task} labels={labels} onSave={onSave} onClose={vi.fn()} onComment={vi.fn()} onDeleteComment={vi.fn()} />));
    expect(screen.getByRole('button', { name: 'Client A' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('button', { name: 'design' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Blocked' }));
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ labels: ['client-a', 'blocked'] }));
  });
});

describe('TaskTimer', () => {
  it('starts and stops, and shows the total', async () => {
    const onTimer = vi.fn(async () => {});
    const user = userEvent.setup();
    const { rerender } = render(wrap(<TaskTimer task={{ ...task, timeSpent: 125 }} onTimer={onTimer} />));
    expect(screen.getByText('2m 05s')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Start timer/ }));
    expect(onTimer).toHaveBeenCalledWith('start');

    rerender(wrap(<TaskTimer task={{ ...task, timeSpent: 125, timerStartedAt: new Date().toISOString() }} onTimer={onTimer} />));
    expect(screen.getByText(/Timer running/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Stop/ }));
    expect(onTimer).toHaveBeenLastCalledWith('stop');
  });
});

describe('TemplatePicker', () => {
  it('creates a board from the chosen template', async () => {
    const calls = fakeFetch({
      'GET /api/templates': () => [{ id: 'wedding', name: 'Wedding plan', emoji: '💍', description: 'Venue and guests', taskCount: 10, columns: ['Ideas', 'To book', 'Booked', 'Done'] }],
      'POST /api/boards': () => ({ id: 'b9', name: 'Wedding plan', columns: [], theme: 'default', role: 'owner', ownerName: null, memberCount: 0 }),
    });
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(wrap(<TemplatePicker onCreated={onCreated} onClose={vi.fn()} />));
    await user.click(await screen.findByRole('button', { name: /Wedding plan/ }));
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ template: 'wedding' });
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'b9' }));
  });
});

describe('ReportsPage', () => {
  it('shows totals, boards and switches to 30 days', async () => {
    const report = (days: number) => ({
      days,
      from: '2026-11-13',
      to: '2026-11-19',
      series: Array.from({ length: days }, (_, i) => ({ day: `2026-11-${String(i + 1).padStart(2, '0')}`, completed: i % 2, created: 1 })),
      totals: { completed: 3, created: 7, open: 5, overdue: 1, timeSpent: 3900 },
      byPriority: { high: 2, medium: 2, low: 1 },
      byBoard: [{ id: 'b1', name: 'Exams', open: 5, done: 3, timeSpent: 3900 }],
      topTime: [{ id: 't1', title: 'Maths revision', board: 'Exams', seconds: 3900 }],
    });
    const calls = fakeFetch({
      'GET /api/auth/me': () => ({ user: { name: 'Priya', email: 'p@test.local', avatarColor: '#5b5bf0' } }),
      'GET /api/account/report': (url) => report(url.includes('days=30') ? 30 : 7),
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AuthProvider>
          <ReportsPage />
        </AuthProvider>
      </MemoryRouter>
    );
    expect(await screen.findByText('Maths revision')).toBeTruthy();
    expect(screen.getAllByText('1h 05m').length).toBeGreaterThan(0);
    expect(within(screen.getByRole('table')).getByText('Exams')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '30 days' }));
    expect(calls.some((c) => c.url.includes('days=30'))).toBe(true);
  });
});

describe('TaskLinks', () => {
  it('adds a pasted Google link with Enter and lists links safely', async () => {
    const { default: TaskLinks } = await import('../components/TaskLinks.tsx');
    const onAdd = vi.fn(async () => {});
    const onRemove = vi.fn(async () => {});
    const user = userEvent.setup();
    render(wrap(<TaskLinks links={[{ id: 'l1', url: 'https://docs.google.com/document/d/a', title: 'Plan doc', kind: 'docs' }]} onAdd={onAdd} onRemove={onRemove} />));

    const link = screen.getByRole('link', { name: 'Plan doc' });
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('target')).toBe('_blank');

    await user.type(screen.getByLabelText(/Paste a Google Drive/), 'https://drive.google.com/file/d/1{Enter}');
    expect(onAdd).toHaveBeenCalledWith('https://drive.google.com/file/d/1');
    await user.click(screen.getByRole('button', { name: /Remove link: Plan doc/ }));
    expect(onRemove).toHaveBeenCalledWith('l1');
  });
});
