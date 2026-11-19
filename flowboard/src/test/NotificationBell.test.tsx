import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import NotificationBell from '../components/NotificationBell.tsx';
import { fakeFetch } from './fakeFetch.ts';

// 🔔 Bell: unread count, click pannaa read + task ku po

function Where() {
  const { pathname, search } = useLocation();
  return <p data-testid="where">{pathname + search}</p>;
}

const items = [
  { id: 'n1', type: 'assigned', text: 'Anu assigned you "Logo"', boardId: 'b1', taskId: 't1', read: false, createdAt: new Date().toISOString() },
  { id: 'n2', type: 'shared', text: 'Anu shared "Team"', boardId: 'b1', taskId: null, read: true, createdAt: new Date().toISOString() },
];

describe('NotificationBell', () => {
  it('shows the unread count and opens the task when clicked', async () => {
    const calls = fakeFetch({
      'GET /api/notifications': () => ({ unread: 1, items }),
      'POST /api/notifications/n1/read': () => ({ ok: true }),
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <NotificationBell />
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    );

    const bell = await screen.findByRole('button', { name: 'Notifications, 1 unread' });
    await user.click(bell);
    await user.click(screen.getByRole('button', { name: /assigned you/ }));

    expect(screen.getByTestId('where').textContent).toBe('/app?board=b1&task=t1');
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url === '/api/notifications/n1/read')).toBe(true));
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy(); // count pochu
  });

  it('says you are all caught up when empty', async () => {
    fakeFetch({ 'GET /api/notifications': () => ({ unread: 0, items: [] }) });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: 'Notifications' }));
    expect(screen.getByText(/all caught up/)).toBeTruthy();
  });
});
