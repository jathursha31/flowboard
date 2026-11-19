import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.ts';
import { trackEvent } from '../analytics.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';

// 💎 Account page: en plan (Free / Pro), Pro ku upgrade (Stripe), billing manage

interface Limits {
  boards: number;
  members: number;
  aiPerHour: number;
}
interface Billing {
  enabled: boolean;
  plan: 'free' | 'pro';
  status: string | null;
  canManage: boolean;
  limits: { free: Limits; pro: Limits };
}

export default function PlanSection() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [info, setInfo] = useState<Billing | null>(null);
  const [busy, setBusy] = useState(false);
  const [params, setParams] = useSearchParams();
  const justPaid = params.get('upgraded') === '1';

  useEffect(() => {
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      api<Billing>('/api/billing')
        .then((data) => {
          setInfo(data);
          // 💳 Stripe la irunthu vandhaa: webhook konjam late aagalaam, Pro aagura varai 2s ku oru thadavai (max 10)
          if (justPaid && data.plan !== 'pro' && ++tries < 10) timer = setTimeout(load, 2000);
          if (justPaid && data.plan === 'pro') {
            toast('Welcome to Pro! 🎉');
            if (user) setUser({ ...user, plan: 'pro' });
            setParams({}, { replace: true });
          }
        })
        .catch(() => setInfo(null));
    load();
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stripe page ku po (card details anga thaan: namma server ku varaadhu)
  const go = async (path: '/api/billing/checkout' | '/api/billing/portal') => {
    setBusy(true);
    try {
      const { url } = await api<{ url: string }>(path, 'POST');
      if (path.endsWith('checkout')) trackEvent('pricing_click');
      window.location.assign(url);
    } catch (err) {
      toast((err as Error).message, 'error');
      setBusy(false);
    }
  };

  if (!info) return null;
  const pro = info.plan === 'pro';
  const rows: [string, keyof Limits][] = [
    ['Boards', 'boards'],
    ['People per board', 'members'],
    ['AI requests per hour', 'aiPerHour'],
  ];

  return (
    <section className="card account__card plan-card" id="plan">
      <h2>
        💎 Your plan <span className={`plan-pill ${pro ? 'is-pro' : ''}`}>{pro ? 'Pro' : 'Free'}</span>
      </h2>
      {justPaid && !pro && <p className="muted">⏳ Confirming your payment…</p>}
      {info.status && !['active', 'trialing'].includes(info.status) && (
        <p className="modal__error">Subscription status: {info.status}. {pro ? 'Please update your card under Manage billing.' : ''}</p>
      )}

      <table className="plan-table">
        <thead>
          <tr><th /><th>Free</th><th>Pro</th></tr>
        </thead>
        <tbody>
          {rows.map(([label, key]) => (
            <tr key={key}>
              <th scope="row">{label}</th>
              <td className={pro ? '' : 'is-current'}>{info.limits.free[key]}</td>
              <td className={pro ? 'is-current' : ''}>{info.limits.pro[key]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="data-actions">
        {!info.enabled ? (
          <p className="muted small">💳 Online payments are coming soon.</p>
        ) : pro || info.canManage ? (
          <button type="button" className="btn btn--outline" disabled={busy} onClick={() => go('/api/billing/portal')}>
            {busy ? 'Opening…' : '🧾 Manage billing'}
          </button>
        ) : null}
        {info.enabled && !pro && (
          <button type="button" className="btn btn--primary" disabled={busy} onClick={() => go('/api/billing/checkout')}>
            {busy ? 'Opening…' : '💎 Upgrade to Pro'}
          </button>
        )}
      </div>
      {info.enabled && !pro && <p className="muted small">You&apos;ll pay on Stripe&apos;s secure page. Cancel anytime from Manage billing.</p>}
    </section>
  );
}
