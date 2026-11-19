import { useEffect, useState } from 'react';
import { useLang } from '../context/LanguageContext.tsx';

const DISMISS_KEY = 'flowboard-install-dismissed';

// 📱 "Install app" card: browser "intha site ah install pannalaam" nu sonnaa mattum varum
// (Chrome / Edge / Android. iPhone Safari la Share → "Add to Home Screen" thaan)
// Chrome / Edge oda "install" event (TypeScript la innum standard type illa)
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallPrompt() {
  const { t } = useLang();
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false); // 🆕 🍎 iPhone la install event illa: eppadi pannanum nu sollu

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      /* storage illana kaattu */
    }

    const onPrompt = (event: Event) => {
      const e = event as BeforeInstallPromptEvent;
      e.preventDefault(); // browser oda default popup vendaam, namma card kaattuvom
      if (!dismissed) setPromptEvent(e);
    };
    const onInstalled = () => setPromptEvent(null);
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!dismissed && !standalone && /iphone|ipad|ipod/i.test(navigator.userAgent)) setIosHint(true);

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const later = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setPromptEvent(null);
    setIosHint(false);
  };

  if (iosHint && !promptEvent) {
    return (
      <div className="install-card" role="dialog" aria-labelledby="install-title">
        <img src="/icon-192.png" alt="" width="40" height="40" />
        <div>
          <strong id="install-title">{t('mobile.iosTitle')}</strong>
          <p>{t('mobile.iosHint')}</p>
        </div>
        <div className="install-card__actions">
          <button type="button" className="btn btn--ghost" onClick={later}>{t('install.later')}</button>
        </div>
      </div>
    );
  }
  if (!promptEvent) return null;

  const install = async () => {
    promptEvent.prompt(); // browser oda "Install?" popup
    await promptEvent.userChoice;
    setPromptEvent(null); // oru thadavai thaan use pannalaam
  };

  return (
    <div className="install-card" role="dialog" aria-labelledby="install-title">
      <img src="/icon-192.png" alt="" width="40" height="40" />
      <div>
        <strong id="install-title">{t('install.title')}</strong>
        <p>{t('install.text')}</p>
      </div>
      <div className="install-card__actions">
        <button type="button" className="btn btn--primary" onClick={install} data-track="install_app">
          {t('install.button')}
        </button>
        <button type="button" className="btn btn--ghost" onClick={later}>
          {t('install.later')}
        </button>
      </div>
    </div>
  );
}
