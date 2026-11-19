import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { listenForTrackedClicks, trackPageview } from './analytics.ts'; // 🆕 📊
import Navbar from './components/Navbar.tsx';
import ScrollTop from './components/ScrollTop.tsx';
import SiteBanner from './components/SiteBanner.tsx'; // 🆕 📢
import InstallPrompt from './components/InstallPrompt.tsx'; // 🆕 📱
import CommandPalette from './components/CommandPalette.tsx'; // 🆕 ⌨️
import MobileNav from './components/MobileNav.tsx'; // 🆕 📱
import HomePage from './pages/HomePage.tsx';
// ⚡ Matha pages ah theva padumbodhu mattum load (home page vegamaa open aaga)
const BoardPage = lazy(() => import('./pages/BoardPage.tsx'));
const SignInPage = lazy(() => import('./pages/SignInPage.tsx'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage.tsx'));
const AccountPage = lazy(() => import('./pages/AccountPage.tsx')); // 🆕 👤
const ReportsPage = lazy(() => import('./pages/ReportsPage.tsx')); // 🆕 📊
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage.tsx')); // 🆕 🔑
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage.tsx')); // 🆕 🔑
import { AuthProvider } from './context/AuthContext.tsx';
import { ToastProvider } from './context/ToastContext.tsx';
import { LanguageProvider } from './context/LanguageContext.tsx'; // 🆕 🌐
import { useTheme } from './hooks/useTheme.ts';

// 📊 Page maarumbodhellaam 'page view' count
function PageTracker() {
  const { pathname } = useLocation();
  useEffect(() => listenForTrackedClicks(), []);
  useEffect(() => trackPageview(pathname), [pathname]);
  return null;
}

// 🗺️ App = pages map. Endha address ku endha page nu solludhu
export default function App() {
  const { theme, toggleTheme } = useTheme();

  return (
    <BrowserRouter>
      {/* 👤 Login user + 🔔 toasts + 🌐 mozhi: ellaa pages kkum share */}
      <PageTracker />
      <LanguageProvider>
        <AuthProvider>
          <ToastProvider>
            <SiteBanner />
            <Navbar theme={theme} onToggleTheme={toggleTheme} />
            <Suspense fallback={<main className="page" aria-busy="true" />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/app" element={<BoardPage />} />
              <Route path="/signin" element={<SignInPage />} />
              <Route path="/account" element={<AccountPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
            </Suspense>
            <ScrollTop />
            <InstallPrompt />
            <MobileNav />
            <CommandPalette onToggleTheme={toggleTheme} />
          </ToastProvider>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}
