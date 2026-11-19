import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatPanel from '../components/ChatPanel.tsx';
import { LanguageProvider } from '../context/LanguageContext.tsx';
import { ToastProvider } from '../context/ToastContext.tsx';
import { fakeFetch } from './fakeFetch.ts';

// 💬 Team chat panel

const msg = (id: string, text: string, extra = {}) => ({
  id, userId: 'u2', name: 'Bala Murugan', avatarColor: '#10b981', text, createdAt: new Date().toISOString(), mine: false, canDelete: false, ...extra,
});

afterEach(() => vi.unstubAllGlobals());

const renderIt = (refreshKey = 0) => (
  <LanguageProvider>
    <ToastProvider>
      <ChatPanel boardId="b1" refreshKey={refreshKey} onClose={vi.fn()} />
    </ToastProvider>
  </LanguageProvider>
);

describe('ChatPanel', () => {
  it('shows messages, highlights @mentions and sends with Enter', async () => {
    const calls = fakeFetch({
      'GET /api/boards/b1/chat': () => ({ messages: [msg('a1', 'Morning @Anu, logo done?')], hasMore: false }),
      'POST /api/boards/b1/chat': (_url, body) => msg('a2', (body as { text: string }).text, { name: 'Anu Raj', mine: true, canDelete: true }),
    });
    const user = userEvent.setup();
    render(renderIt());

    expect(await screen.findByText('@Anu')).toBeTruthy();
    expect(screen.getByText('@Anu').tagName).toBe('MARK');

    const box = screen.getByLabelText(/Message the team/);
    await user.type(box, 'Yes!{Shift>}{Enter}{/Shift}Sending now{Enter}');
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ text: 'Yes!\nSending now' });
    expect(await screen.findByText(/Sending now/)).toBeTruthy();
    expect((box as HTMLTextAreaElement).value).toBe('');
    expect(screen.getAllByRole('button', { name: 'Delete message' })).toHaveLength(1);
  });

  it('loads older messages and keeps them after a live refresh', async () => {
    fakeFetch({
      'GET /api/boards/b1/chat': (url) =>
        url.includes('before=') ? { messages: [msg('a0', 'Very old')], hasMore: false } : { messages: [msg('a1', 'Newest')], hasMore: true },
    });
    const user = userEvent.setup();
    const { rerender } = render(renderIt());

    await user.click(await screen.findByRole('button', { name: 'Load older messages' }));
    expect(await screen.findByText('Very old')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Load older messages' })).toBeNull();

    rerender(renderIt(1)); // live 'chat' event
    expect(await screen.findByText('Newest')).toBeTruthy();
    expect(screen.getByText('Very old')).toBeTruthy();
  });
});
