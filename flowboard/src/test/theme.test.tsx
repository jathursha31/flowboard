import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppearanceSection from '../components/AppearanceSection.tsx';

// 🎨 Theme mode + accent

describe('AppearanceSection', () => {
  it('switches mode and accent on <html> and remembers them', async () => {
    const user = userEvent.setup();
    render(<AppearanceSection />);
    const root = document.documentElement;

    await user.click(screen.getByRole('button', { name: /Midnight/ }));
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.hasAttribute('data-midnight')).toBe(true);
    expect(localStorage.getItem('flowboard-theme')).toBe('midnight');

    await user.click(screen.getByRole('button', { name: 'Forest' }));
    expect(root.getAttribute('data-accent')).toBe('forest');
    expect(screen.getByRole('button', { name: 'Forest' }).getAttribute('aria-pressed')).toBe('true');

    await user.click(screen.getByRole('button', { name: /Light/ }));
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(root.hasAttribute('data-midnight')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Indigo' }));
    expect(root.hasAttribute('data-accent')).toBe(false);
  });
});
