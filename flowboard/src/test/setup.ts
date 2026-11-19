import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// 🧪 Ovvoru test kkum apram: screen ah suththam pannu, fake fetch / timers ah reset
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

// jsdom la illaadhavai
window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
window.scrollTo = () => {};
