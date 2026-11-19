import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import CommandPalette from '../components/CommandPalette.tsx';
import { AuthProvider } from '../context/AuthContext.tsx';
import { fakeFetch } from './fakeFetch.ts';

// ⌨️ Ctrl + K: thira, thedu, Enter amukkinaa sariyaana page ku pogudhaa

function Where() {
  const { pathname, search } = useLocation();
  return <p data-testid="where">{pathname + search}</p>;
}

const renderPalette = () => {
  fakeFetch({
    'GET /api/auth/me': () => ({ user: { name: 'Anu', email: 'anu@test.local', hasPassword: true } }),
    'GET /api/search': (url: string) =>
      new URL(url, 'http://x').searchParams.get('q') === 'logo'
        ? { boards: [], tasks: [{ id: 't9', title: 'Design logo', boardId: 'b1', boardName: 'Team' }] }
        : { boards: [{ id: 'b1', name: 'Team' }], tasks: [] },
  });
  const onToggleTheme = vi.fn();
  render(
    <MemoryRouter initialEntries={["/"]}>
      <AuthProvider>
        <CommandPalette onToggleTheme={onToggleTheme} />
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
  return { onToggleTheme, user: userEvent.setup() };
};

describe('CommandPalette', () => {
  it('opens with Ctrl+K and lists commands and boards', async () => {
    const { user } = renderPalette();
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.keyboard('{Control>}k{/Control}');
    expect(screen.getByRole('dialog', { name: 'Search everything' })).toBeTruthy();
    expect(screen.getByRole('option', { name: /Open my board/ })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('option', { name: /Team/ })).toBeTruthy());
  });

  it('finds a task and opens it on Enter', async () => {
    const { user } = renderPalette();
    await user.keyboard('{Control>}k{/Control}');
    await user.type(screen.getByRole('combobox'), 'logo');
    await waitFor(() => expect(screen.getByRole('option', { name: /Design logo/ })).toBeTruthy());
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('where').textContent).toBe('/app?board=b1&task=t9');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('runs commands with the arrow keys', async () => {
    const { onToggleTheme, user } = renderPalette();
    await user.keyboard('{Control>}k{/Control}');
    await user.type(screen.getByRole('combobox'), 'dark');
    await user.keyboard('{Enter}');
    expect(onToggleTheme).toHaveBeenCalled();
  });
});
