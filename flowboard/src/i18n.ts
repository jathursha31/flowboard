// 🌐 Landing page text: English, தமிழ், සිංහල, हिन्दी
// t('hero.lead') maari key vachu edukkalaam. Tamil la illaadha key ku English thaane varum.

// 🗂️ Dropdown la varura mozhigal (pudhu mozhi venumna inga + keezha oru block serungal)
export const LANGUAGES = [
  { code: 'en', label: 'English', locale: 'en-US' },
  { code: 'ta', label: 'தமிழ்', locale: 'ta-IN' },
  { code: 'si', label: 'සිංහල', locale: 'si-LK' },
  { code: 'hi', label: 'हिन्दी', locale: 'hi-IN' },
];


import en from './locales/en.ts';

export type Lang = 'en' | 'ta' | 'si' | 'hi';
export type Translations = typeof en;

// English eppovum ready. Mattha mozhigal loadLanguage() pannina apram inga serum
export const translations: Partial<Record<Lang, Translations>> & { en: Translations } = { en };

// ⚡ Ovvoru mozhiyum thani file (chunk): English users ku Tamil / Sinhala / Hindi text download aagaadhu
const LOADERS: Record<Exclude<Lang, 'en'>, () => Promise<{ default: unknown }>> = {
  ta: () => import('./locales/ta.ts'),
  si: () => import('./locales/si.ts'),
  hi: () => import('./locales/hi.ts'),
};

export async function loadLanguage(code: Lang): Promise<void> {
  if (translations[code]) return;
  const mod = await LOADERS[code as Exclude<Lang, 'en'>]();
  translations[code] = mod.default as Translations;
}
