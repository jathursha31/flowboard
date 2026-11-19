import { useEffect, useRef, useState } from 'react';
import { api } from '../api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { useConfig } from '../hooks/useConfig.ts';
import type { User } from '../types.ts';
import { trackEvent } from '../analytics.ts';

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

// Google oda script ah oru thadavai mattum load pannu
let scriptPromise = null;
function loadGoogleScript() {
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Google script failed to load'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

// 🔵 "Sign in with Google" button: server la GOOGLE_CLIENT_ID set pannaa mattum varum
// Google script la vara object (namakku theva padura functions mattum)
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: { client_id: string; callback: (response: { credential: string }) => void }) => void;
          renderButton: (el: HTMLElement, options: Record<string, string>) => void;
        };
      };
    };
  }
}

export default function GoogleButton({ onDone }: { onDone?: (user: User) => void }) {
  const { googleClientId } = useConfig();
  const { setUser } = useAuth();
  const toast = useToast();
  const boxRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (!googleClientId) return undefined;
    let alive = true;
    loadGoogleScript()
      .then(() => {
        if (!alive || !boxRef.current) return;
        window.google!.accounts.id.initialize({
          client_id: googleClientId,
          callback: async ({ credential }) => {
            try {
              const data = await api('/api/auth/google', 'POST', { credential });
              setUser(data.user);
              trackEvent('login'); // 📊
              toast(`Welcome, ${data.user.name}!`);
              done.current?.(data.user);
            } catch (err) {
              toast((err as Error).message, 'error');
            }
          },
        });
        window.google!.accounts.id.renderButton(boxRef.current, { theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill' });
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [googleClientId, setUser, toast]);

  if (!googleClientId || failed) return null;
  return (
    <div className="google-signin">
      <span className="google-signin__or">or</span>
      <div ref={boxRef} />
    </div>
  );
}
