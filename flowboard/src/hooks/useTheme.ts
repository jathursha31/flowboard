import { useSyncExternalStore } from 'react';

// 🎨 Theme: mode (light / dark / midnight / system) + accent colour. Ovvoru device layum thani (localStorage)
// Ellaa components um ore store ah share pannum: Navbar la maaththinaa Account page layum udane maarum

export type Mode = 'light' | 'dark' | 'midnight' | 'system';
export type Accent = 'indigo' | 'ocean' | 'forest' | 'sunset' | 'rose' | 'grape';

export const MODES: { id: Mode; label: string; icon: string }[] = [
  { id: 'light', label: 'Light', icon: '☀️' },
  { id: 'dark', label: 'Dark', icon: '🌙' },
  { id: 'midnight', label: 'Midnight', icon: '🌑' },
  { id: 'system', label: 'System', icon: '💻' },
];
export const ACCENTS: { id: Accent; label: string; color: string }[] = [
  { id: 'indigo', label: 'Indigo', color: '#5b5bf0' },
  { id: 'ocean', label: 'Ocean', color: '#0284c7' },
  { id: 'forest', label: 'Forest', color: '#059669' },
  { id: 'sunset', label: 'Sunset', color: '#ea580c' },
  { id: 'rose', label: 'Rose', color: '#e11d48' },
  { id: 'grape', label: 'Grape', color: '#9333ea' },
];

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage illa: indha session la mattum */
  }
}

const media = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : undefined;
const savedMode = read('flowboard-theme');
const savedAccent = read('flowboard-accent');
let mode: Mode = MODES.some((m) => m.id === savedMode) ? (savedMode as Mode) : 'system';
let accent: Accent = ACCENTS.some((a) => a.id === savedAccent) ? (savedAccent as Accent) : 'indigo';

const resolved = (): 'light' | 'dark' => (mode === 'system' ? (media?.matches ? 'dark' : 'light') : mode === 'light' ? 'light' : 'dark');

let snapshot = { mode, accent, theme: resolved() };
const listeners = new Set<() => void>();

function apply(): void {
  snapshot = { mode, accent, theme: resolved() };
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.setAttribute('data-theme', snapshot.theme);
    if (mode === 'midnight') root.setAttribute('data-midnight', '');
    else root.removeAttribute('data-midnight');
    if (accent === 'indigo') root.removeAttribute('data-accent');
    else root.setAttribute('data-accent', accent);
  }
  for (const fn of listeners) fn();
}
apply();
// 💻 "System" na: computer dark ↔ light maarinaa namma um maarum
media?.addEventListener?.('change', () => mode === 'system' && apply());

export function setMode(next: Mode): void {
  mode = next;
  save('flowboard-theme', next);
  apply();
}
export function setAccent(next: Accent): void {
  accent = next;
  save('flowboard-accent', next);
  apply();
}

export function useTheme() {
  const state = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => snapshot
  );
  // Navbar ☀️/🌙 button: ippo theriyura theme ku opposite
  const toggleTheme = () => setMode(state.theme === 'dark' ? 'light' : 'dark');
  return { ...state, setMode, setAccent, toggleTheme };
}
