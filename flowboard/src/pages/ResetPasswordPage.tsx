import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import type { FormEvent } from 'react';

// 🔑 "/reset-password?token=...": email la vandha link, pudhu password podu
export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { setUser } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    setError('');
    try {
      const data = await api('/api/auth/reset', 'POST', { token, password });
      setUser(data.user);
      toast('Password changed. Welcome back!');
      navigate('/app', { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="page auth-page">
      <div className="card auth-card">
        <h1>Choose a new password</h1>
        <form className="auth-box" onSubmit={submit}>
          <input type="password" placeholder="New password (8+ characters)" aria-label="New password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          <input type="password" placeholder="Type it again" aria-label="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          <button className="btn btn--primary" type="submit" disabled={busy || password.length < 8 || !confirm}>
            {busy ? '…' : 'Save new password'}
          </button>
          {error && <p className="auth-box__error">{error}</p>}
        </form>
        <Link to="/forgot-password" className="link-btn">Need a new link?</Link>
      </div>
    </main>
  );
}
