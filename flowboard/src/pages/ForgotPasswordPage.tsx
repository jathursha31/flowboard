import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.ts';
import { useConfig } from '../hooks/useConfig.ts';
import type { FormEvent } from 'react';

// 🔑 "/forgot-password": email kudutha reset link anuppum
export default function ForgotPasswordPage() {
  const { emailEnabled } = useConfig();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/forgot', 'POST', { email });
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page auth-page">
      <div className="card auth-card">
        <h1>Forgot your password?</h1>
        {sent ? (
          <>
            <p>
              If an account exists for <strong>{email}</strong>, we&apos;ve sent a link to reset your password. It works for 1 hour.
            </p>
            {!emailEnabled && (
              <p className="auth-card__note">🛠️ Developer mode: email isn&apos;t set up yet, so the link is printed in the server terminal.</p>
            )}
          </>
        ) : (
          <form className="auth-box" onSubmit={submit}>
            <span>Enter your email and we&apos;ll send you a reset link.</span>
            <input type="email" placeholder="Email" aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            <button className="btn btn--primary" type="submit" disabled={busy || !email.trim()}>
              {busy ? '…' : 'Send reset link'}
            </button>
            {error && <p className="auth-box__error">{error}</p>}
          </form>
        )}
        <Link to="/signin" className="link-btn">← Back to log in</Link>
      </div>
    </main>
  );
}
