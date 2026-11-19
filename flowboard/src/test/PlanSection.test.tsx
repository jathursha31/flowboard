import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import PlanSection from '../components/PlanSection.tsx';
import { AuthProvider } from '../context/AuthContext.tsx';
import { ToastProvider } from '../context/ToastContext.tsx';
import { fakeFetch } from './fakeFetch.ts';

// 💎 Plan + Stripe upgrade

const limits = { free: { boards: 20, members: 10, aiPerHour: 10 }, pro: { boards: 100, members: 50, aiPerHour: 100 } };
const me = { user: { name: 'Priya', email: 'p@test.local', avatarColor: '#5b5bf0', plan: 'free' } };

afterEach(() => vi.unstubAllGlobals());

const renderIt = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <ToastProvider>
          <PlanSection />
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>
  );

describe('PlanSection', () => {
  it('says payments are coming soon when Stripe is not set up', async () => {
    fakeFetch({ 'GET /api/auth/me': () => me, 'GET /api/billing': () => ({ enabled: false, plan: 'free', status: null, canManage: false, limits }) });
    renderIt();
    expect(await screen.findByText(/payments are coming soon/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Upgrade to Pro/ })).toBeNull();
  });

  it('sends a free user to Stripe Checkout', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    const calls = fakeFetch({
      'GET /api/auth/me': () => me,
      'GET /api/billing': () => ({ enabled: true, plan: 'free', status: null, canManage: false, limits }),
      'POST /api/billing/checkout': () => ({ url: 'https://checkout.stripe.test/c/1' }),
    });
    const user = userEvent.setup();
    renderIt();

    await user.click(await screen.findByRole('button', { name: /Upgrade to Pro/ }));
    expect(calls.some((c) => c.method === 'POST' && c.url === '/api/billing/checkout')).toBe(true);
    expect(assign).toHaveBeenCalledWith('https://checkout.stripe.test/c/1');
  });

  it('shows Manage billing for Pro users', async () => {
    fakeFetch({ 'GET /api/auth/me': () => me, 'GET /api/billing': () => ({ enabled: true, plan: 'pro', status: 'active', canManage: true, limits }) });
    renderIt();
    expect(await screen.findByRole('button', { name: /Manage billing/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Upgrade to Pro/ })).toBeNull();
  });
});
