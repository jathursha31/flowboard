import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { LANGUAGES, loadLanguage, translations } from '../i18n.ts';
import type { Lang } from '../i18n.ts';
import { loadFont } from '../fonts.ts';

// 🌐 English / தமிழ் / සිංහල / हिन्दी: ellaa components kkum share aagura mozhi

export type { Lang };
export type Vars = Record<string, string | number | undefined>;
// t() return: oru text illa list / object (hero.words maari). Ellaa key kkum thani type ezhudhuradhu romba, adhanaala any
export type TFn = (key: string, vars?: Vars) => any;

interface LanguageValue {
  lang: Lang;
  locale: string | undefined;
  changeLang: (code: string) => void;
  t: TFn;
}

const LanguageContext = createContext<LanguageValue | null>(null);
const isLang = (code: unknown): code is Lang => typeof code === 'string' && LANGUAGES.some((l) => l.code === code);

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem('flowboard-lang');
    if (isLang(saved)) return saved;
  } catch {
    /* storage illana default */
  }
  return 'en';
}

// 'hero.lead' → translations[lang].hero.lead (illana English)
// 🆕 vars: t('board.sharedBy', { name: 'Anu' }) → "{name}" ku badhil 'Anu'
function lookup(lang: Lang, key: string, vars?: Vars): any {
  const find = (obj: unknown): any => key.split('.').reduce<any>((o, part) => (o == null ? undefined : o[part]), obj);
  const text = find(translations[lang]) ?? find(translations.en) ?? key;
  if (!vars || typeof text !== 'string') return text;
  return text.replace(/\{(\w+)\}/g, (m: string, name: string) => (name in vars ? String(vars[name]) : m));
}

// 🧪 Provider illaama (tests) use pannaa English
const ENGLISH: LanguageValue = { lang: 'en', locale: 'en-US', changeLang: () => {}, t: (key, vars) => lookup('en', key, vars) };

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [, setLoaded] = useState(0); // mozhi file vandhadhum thirumba render

  // ⚡ Tamil / Sinhala / Hindi text file ah download (vara varai English kaattum)
  useEffect(() => {
    if (translations[lang]) return;
    let alive = true;
    loadLanguage(lang)
      .then(() => alive && setLoaded((n) => n + 1))
      .catch(() => {
        /* net illana English la ye irukkum */
      });
    return () => {
      alive = false;
    };
  }, [lang]);

  // 💾 Nyabagam vechukko + <html lang="ta"> (mozhi font + screen readers ku)
  useEffect(() => {
    document.documentElement.lang = lang;
    loadFont(lang); // 🔤 Tamil / Sinhala / Hindi font andha mozhi ku mattum
    try {
      localStorage.setItem('flowboard-lang', lang);
    } catch {
      /* ignore */
    }
  }, [lang]);

  // 🔀 Dropdown la thernthedutha mozhi (theriyaadha code na maaththaadhe)
  const changeLang = useCallback((code: string) => {
    if (isLang(code)) setLang(code);
  }, []);
  const locale = LANGUAGES.find((l) => l.code === lang)?.locale; // dates ku
  const ready = Boolean(translations[lang]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const t = useCallback<TFn>((key, vars) => lookup(lang, key, vars), [lang, ready]);

  return <LanguageContext.Provider value={{ lang, changeLang, locale, t }}>{children}</LanguageContext.Provider>;
}

// 🪝 const { t } = useLang(); t('nav.pricing')
export function useLang(): LanguageValue {
  return useContext(LanguageContext) ?? ENGLISH;
}
