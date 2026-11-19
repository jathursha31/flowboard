import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AssistantPanel from '../components/AssistantPanel.tsx';
import { LanguageProvider } from '../context/LanguageContext.tsx';
import { ToastProvider } from '../context/ToastContext.tsx';
import { fakeFetch } from './fakeFetch.ts';

// 🤖 AI assistant panel

afterEach(() => vi.unstubAllGlobals());

describe('AssistantPanel', () => {
  it('asks a suggested question, shows the answer and opens a linked task', async () => {
    const task = { id: 't1', title: 'Old essay', board: 'Exams', boardId: 'b1', due: '2026-11-01' };
    const calls = fakeFetch({
      'POST /api/ai/assistant': (_url, body) => {
        const { question } = body as { question: string };
        return { answer: question.includes('overdue') ? '⏰ These tasks are overdue (1):' : 'Nothing else.', tasks: question.includes('overdue') ? [task] : [], demo: true };
      },
    });
    const onOpenTask = vi.fn();
    const user = userEvent.setup();
    render(
      <LanguageProvider>
        <ToastProvider>
          <AssistantPanel onOpenTask={onOpenTask} onClose={vi.fn()} />
        </ToastProvider>
      </LanguageProvider>
    );

    await user.click(screen.getByRole('button', { name: 'What is overdue?' }));
    expect(await screen.findByText(/These tasks are overdue/)).toBeTruthy();
    expect(screen.getByText(/Demo answers/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Old essay' }));
    expect(onOpenTask).toHaveBeenCalledWith(task);

    // Follow-up: munnaadi pesinadhu history ah pogum
    await user.type(screen.getByLabelText(/Ask about your tasks/), 'anything else?{Enter}');
    expect(await screen.findByText('Nothing else.')).toBeTruthy();
    const last = calls.at(-1)!.body as { history: { role: string }[] };
    expect(last.history.map((h) => h.role)).toEqual(['user', 'assistant']);
  });
});
