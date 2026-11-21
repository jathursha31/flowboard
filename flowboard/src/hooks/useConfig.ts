import { useEffect, useState } from 'react';
import { api } from '../api.ts';

export interface AppConfig {
  googleClientId: string | null;
  emailEnabled: boolean;
  billingEnabled?: boolean; // 💳 Stripe keys server la irukkaa
  live?: 'sse' | 'poll'; // ⚡ live updates eppadi (Vercel la 'poll')
}

// ⚙️ Server la endha optional features on nu (Google login, email) oru thadavai kettu nyaabagam vechukko
let cached: AppConfig | null = null;
let pending: Promise<AppConfig> | null = null;

export function useConfig(): AppConfig {
  const [config, setConfig] = useState<AppConfig>(cached ?? { googleClientId: null, emailEnabled: false });
  useEffect(() => {
    if (cached) return undefined;
    let alive = true;
    pending ??= api<AppConfig>('/api/config').then((c) => (cached = c));
    pending.then((c) => alive && setConfig(c)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return config;
}
