import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthBox from '../components/AuthBox.tsx';
import { useAuth } from '../context/AuthContext.tsx';

// 🔐 "/signin" page: login / sign up mattum
// (server la "/login" admin ku irukku, athunaala inga "/signin" nu vera peru)
export default function SignInPage() {
  const { user, checking } = useAuth();
  const navigate = useNavigate();

  // ✅ Already login aagirundhaa nerada board ku po
  useEffect(() => {
    if (!checking && user) navigate('/app', { replace: true });
  }, [checking, user, navigate]);

  return (
    <main className="page auth-page">
      <div className="card auth-card">
        <h1>Welcome to Flowboard</h1>
        <p>Log in or create a free account to get your own private board.</p>
        <AuthBox onDone={() => navigate('/app')} />
        <Link to="/" className="link-btn">← Back to home</Link>
      </div>
    </main>
  );
}
