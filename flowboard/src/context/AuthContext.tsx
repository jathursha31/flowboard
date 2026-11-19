import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { User } from '../types.ts';

interface AuthValue {
  user: User | null;
  setUser: Dispatch<SetStateAction<User | null>>;
  checking: boolean;
  logout: () => Promise<void>;
}
import { api } from '../api.ts';

// 👤 Login aana user ah ellaa components um share panna oru "common petti"
// (Navbar, Demo, AuthBox, Sign in page: ellaarum ore user ah paakkanum)
const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true); // ⏳ "yaar login?" nu server kitta kettukittu irukkom

  // 👀 App open aagumbodhu oru thadavai: yaar login aagirukkaanga?
  useEffect(() => {
    api<{ user: User | null }>('/api/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  // 🚪 Logout: server la ticket azhi, inga user ah null aakku
  const logout = useCallback(async () => {
    await api('/api/auth/logout', 'POST').catch(() => {});
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, checking, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// 🪝 Endha component la venaalum: const { user } = useAuth();
export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
