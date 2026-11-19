import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DeveloperSection from '../components/DeveloperSection.tsx';
import { ToastProvider } from '../context/ToastContext.tsx';
import { fakeFetch } from './fakeFetch.ts';

// 🔌 API keys + webhooks section (Account page)

const board = { id: 'b1', name: 'My board', columns: [], theme: 'default', role: 'owner', access: 'owner', ownerName: null, memberCount: 0 };
const shared = { ...board, id: 'b2', name: 'Friend board', role: 'member', access: 'editor' };

afterEach(() => vi.unstubAllGlobals());

const renderIt = () =>
  render(
    <ToastProvider>
      <DeveloperSection />
    </ToastProvider>
  );

describe('DeveloperSection', () => {
  it('creates an API key and shows the full key once', async () => {
    const calls = fakeFetch({
      'GET /api/keys': () => [],
      'POST /api/keys': (_url, body) => ({ id: 'k1', name: (body as { name: string }).name, prefix: 'fb_abcdefgh', createdAt: new Date().toISOString(), lastUsedAt: null, key: 'fb_abcdefgh_SECRET' }),
      'GET /api/boards': () => [board],
      'GET /api/boards/b1/webhooks': () => ({ events: ['task.created'], webhooks: [] }),
    });
    const user = userEvent.setup();
    renderIt();

    await user.type(screen.getByLabelText('Key name'), 'My script');
    await user.click(screen.getByRole('button', { name: 'Create key' }));
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ name: 'My script' });
    expect(await screen.findByText('fb_abcdefgh_SECRET')).toBeTruthy();
    expect(screen.getByText('My script')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'I saved it' }));
    expect(screen.queryByText('fb_abcdefgh_SECRET')).toBeNull();
  });

  it('only offers boards you own and sends the picked events', async () => {
    const calls = fakeFetch({
      'GET /api/keys': () => [],
      'GET /api/boards': () => [board, shared],
      'GET /api/boards/b1/webhooks': () => ({ events: ['task.created', 'task.moved'], webhooks: [] }),
      'POST /api/boards/b1/webhooks': (_url, body) => ({ id: 'w1', boardId: 'b1', ...(body as object), active: true, failures: 0, deliveries: [], secret: 'whsec_SHH' }),
    });
    const user = userEvent.setup();
    renderIt();

    const select = await screen.findByLabelText('Board');
    expect([...(select as HTMLSelectElement).options].map((o) => o.text)).toEqual(['My board']);

    await user.click(await screen.findByLabelText('task.moved'));
    await user.type(screen.getByLabelText('Webhook URL'), 'https://example.com/hook');
    await user.click(screen.getByRole('button', { name: 'Add webhook' }));

    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ url: 'https://example.com/hook', events: ['task.moved'] });
    expect(await screen.findByText('whsec_SHH')).toBeTruthy();
    expect(screen.getByText('https://example.com/hook')).toBeTruthy();
  });
});
