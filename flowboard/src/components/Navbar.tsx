import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom'; // 🆕 pages maara
import Icon from './Icon.tsx';
import { useAuth } from '../context/AuthContext.tsx'; // 🆕 👤
import { useToast } from '../context/ToastContext.tsx'; // 🆕 🔔
import { useLang } from '../context/LanguageContext.tsx'; // 🆕 🌐
import { LANGUAGES } from '../i18n.ts';
import NotificationBell from './NotificationBell.tsx'; // 🆕 🔔

// label = i18n key (nav.features ...)
const links = [
  { id: 'features', label: 'nav.features' },
  { id: 'demo', label: 'nav.demo' },
  { id: 'pricing', label: 'nav.pricing' },
  { id: 'testimonials', label: 'nav.testimonials' },
  { id: 'faq', label: 'nav.faq' },
];

// 🆕 "jathu Naga" → "JN"
function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w: string) => w[0].toUpperCase())
    .join('');
}

export default function Navbar({ theme, onToggleTheme }: { theme: string; onToggleTheme: () => void }) {
  const { user, logout } = useAuth(); // 🆕
  const toast = useToast(); // 🆕
  const { t, lang, changeLang } = useLang(); // 🆕 🌐
  const { pathname } = useLocation(); // 🆕 ippo endha page
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState('');
  const [menuOpen, setMenuOpen] = useState(false); // 🆕 user dropdown thirandhirukkaa
  const menuRef = useRef<HTMLDivElement>(null);

  // Shadow on scroll
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Highlight the section currently on screen (🆕 page maarinaa thirumba paaru)
  useEffect(() => {
    setActive('');
    const sections = links.map((l) => document.getElementById(l.id)).filter((el): el is HTMLElement => Boolean(el));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => e.isIntersecting && setActive(e.target.id));
      },
      { rootMargin: '-45% 0px -50% 0px' }
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [pathname]);

  // Lock page scroll while the mobile menu is open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // 🆕 User dropdown: veliya click / Esc pannaa close
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenuOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // 🆕 🚪 Logout
  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    toast('Logged out.');
  };

  const closeAll = () => {
    setOpen(false);
    setMenuOpen(false);
  };

  return (
    <header className={`nav ${scrolled ? 'nav--scrolled' : ''}`}>
      <div className="container nav__inner">
        {/* 🆕 "/#..." = vera page la irunthaalum home page ku pogum */}
        <a href="/#top" className="brand" onClick={closeAll} aria-label="Flowboard home">
          <img src="/logo.svg" alt="" width="32" height="32" />
          <span>Flowboard</span>
        </a>

        <nav className={`nav__links ${open ? 'is-open' : ''}`} aria-label="Main">
          {links.map((l) => (
            <a
              key={l.id}
              href={`/#${l.id}`}
              className={active === l.id ? 'is-active' : ''}
              onClick={closeAll}
            >
              {t(l.label)}
            </a>
          ))}
          {/* Login aagirundhaa "My board" link */}
          {user && (
            <Link to="/app" className={pathname === '/app' ? 'is-active' : ''} onClick={closeAll}>
              {t('nav.myBoard')}
            </Link>
          )}
          <Link to={user ? '/app' : '/signin'} className="btn btn--primary nav__cta-mobile" onClick={closeAll} data-track={user ? undefined : "cta_click"}>
            {user ? t('nav.openBoard') : t('nav.getStarted')}
          </Link>
        </nav>

        <div className="nav__actions">
          {/* 🆕 🌐 Mozhi dropdown: English / தமிழ் / සිංහල / हिन्दी */}
          <label className="lang-select" title={t('nav.language')}>
            <span className="sr-only">{t('nav.language')}</span>
            <span aria-hidden="true">🌐</span>
            <select value={lang} onChange={(e) => changeLang(e.target.value)}>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="icon-btn"
            onClick={onToggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>

          {user && <NotificationBell />}

          {/* 🆕 👤 Login aagirundhaa user menu, illana "Get started" */}
          {user ? (
            <div className="user-menu" ref={menuRef}>
              <button
                type="button"
                className="user-menu__btn"
                onClick={() => setMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <span className="avatar" style={{ background: user.avatarColor }} aria-hidden="true">{initials(user.name)}</span>
                <span className="user-menu__name">{user.name.split(' ')[0]}</span>
                {user.plan === 'pro' && <span className="plan-pill is-pro" title="Pro plan">Pro</span>}
                <Icon name="chevron" size={16} />
              </button>
              {menuOpen && (
                <div className="user-menu__list" role="menu">
                  <div className="user-menu__who">
                    <strong>{user.name}</strong>
                    <small>{user.email}</small>
                  </div>
                  <Link role="menuitem" to="/app" onClick={closeAll}>🎮 My board</Link>
                  <Link role="menuitem" to="/account" onClick={closeAll}>👤 Account &amp; stats</Link>
                  <Link role="menuitem" to="/reports" onClick={closeAll}>📊 Reports</Link>
                  <button role="menuitem" type="button" onClick={handleLogout}>🚪 Log out</button>
                </div>
              )}
            </div>
          ) : (
            <Link to="/signin" className="btn btn--primary nav__cta" data-track="cta_click">
              {t('nav.getStarted')}
            </Link>
          )}

          <button
            className="icon-btn nav__toggle"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            <Icon name={open ? 'close' : 'menu'} />
          </button>
        </div>
      </div>
      {open && <div className="nav__backdrop" onClick={() => setOpen(false)} />}
    </header>
  );
}
