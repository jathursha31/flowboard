import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.tsx';
import { useLang } from '../context/LanguageContext.tsx';

// 📱 Phone la keezha "app maadhiri" tab bar (login aagirundhaa mattum; CSS la chinna screen la mattum theriyum)
export default function MobileNav() {
  const { user } = useAuth();
  const { t } = useLang();
  if (!user) return null;
  const tabs = [
    { to: '/', icon: '🏠', label: t('mobile.home'), end: true },
    { to: '/app', icon: '📋', label: t('mobile.board'), end: false },
    { to: '/reports', icon: '📊', label: t('mobile.reports'), end: false },
    { to: '/account', icon: '👤', label: t('mobile.account'), end: false },
  ];
  return (
    <nav className="mobile-nav" aria-label="App">
      {tabs.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.end} className={({ isActive }) => `mobile-nav__tab ${isActive ? 'is-active' : ''}`}>
          <span aria-hidden="true">{tab.icon}</span>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
