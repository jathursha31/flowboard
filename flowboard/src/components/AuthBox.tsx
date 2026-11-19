import { useState } from 'react';
import { Link } from 'react-router-dom';
import GoogleButton from './GoogleButton.tsx'; // 🆕 🔵
import { api } from '../api.ts';
import { trackEvent } from '../analytics.ts';
import { useAuth } from '../context/AuthContext.tsx'; // 🆕 common user petti
import { useToast } from '../context/ToastContext.tsx'; // 🆕 🔔 popup messages
import type { ChangeEvent, FormEvent } from 'react';
import type { User } from '../types.ts';

const EMPTY = { name: '', email: '', password: '' };

// 👤 Login / Sign up box
// 🆕 user ippo AuthContext la irunthu varum (props venaam)
// onDone = login / sign up aanadhum enna pannanum (optional, ex: /app ku po)
export default function AuthBox({ onDone }: { onDone?: (user: User) => void }) {
  const { user, setUser, logout } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState('login'); // 'login' illa 'signup'
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false); // ⏳ server badhil kaathirukkom

  // ⌨️ Type pannumbodhu form la save
  const update = (e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  // 📤 Login / Sign up anuppu
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api(`/api/auth/${mode}`, 'POST', form);
      setForm(EMPTY);
      setUser(data.user); // ✅ ellaa components kkum "login aagiduchu" nu theriyum
      trackEvent(mode === 'login' ? 'login' : 'signup'); // 📊
      toast(mode === 'login' ? `Welcome back, ${data.user.name}!` : `Account created. Welcome, ${data.user.name}!`);
      onDone?.(data.user);
    } catch (err) {
      setError((err as Error).message); // ❌ server sonna error kaattu
    } finally {
      setBusy(false);
    }
  };

  // 🚪 Logout
  const handleLogout = async () => {
    await logout();
    toast('Logged out.');
  };

  // 🔄 Login ↔ Sign up maathu
  const switchMode = () => {
    setMode(mode === 'login' ? 'signup' : 'login');
    setError('');
  };

  // ✅ Login aagirundhaa: vanakkam + logout button
  if (user) {
    return (
      <div className="auth-box auth-box--user">
        <span>
          👋 Hi <strong>{user.name}</strong>! This is your private board.
        </span>
        <button className="btn btn--outline" onClick={handleLogout}>Log out</button>
      </div>
    );
  }

  // 🔐 Login aagala: form
  return (
    <form className="auth-box" onSubmit={submit}>
      <span>
        {mode === 'login'
          ? 'Log in to keep your own private board.'
          : 'Create a free account to get your own private board.'}
      </span>

      {mode === 'signup' && (
        <input name="name" placeholder="Your name" aria-label="Your name" value={form.name} onChange={update} autoComplete="name" />
      )}
      <input name="email" type="email" placeholder="Email" aria-label="Email" value={form.email} onChange={update} autoComplete="email" />
      <input
        name="password"
        type="password"
        placeholder={mode === 'signup' ? 'Password (8+ characters)' : 'Password'}
        aria-label="Password"
        value={form.password}
        onChange={update}
        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
      />

      <button className="btn btn--primary" type="submit" disabled={busy}>
        {busy ? '…' : mode === 'login' ? 'Log in' : 'Sign up'}
      </button>

      <button type="button" className="link-btn" onClick={switchMode}>
        {mode === 'login' ? 'No account? Sign up' : 'Already have an account? Log in'}
      </button>
      {/* 🆕 🔑 Password maranthuttaa */}
      {mode === 'login' && (
        <Link to="/forgot-password" className="link-btn">Forgot password?</Link>
      )}

      {/* 🆕 🔵 Google (server la setup pannirundhaa mattum theriyum) */}
      <GoogleButton onDone={onDone} />

      {error && <p className="auth-box__error">{error}</p>}
    </form>
  );
}
