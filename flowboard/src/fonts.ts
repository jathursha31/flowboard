// 🔤 Google Fonts ah JS la load pannu: page mudhalla system font la udane theriyum, font vandhadhum maarum
// (HTML la <link rel="stylesheet"> pottaa, font download aagura varai page vellaiyaa nikkum: Lighthouse "render-blocking")
// Tamil / Sinhala / Hindi fonts: andha mozhi choose pannaa mattum (English users ku 3 extra fonts download vendaam)

const FAMILIES: Record<string, string> = {
  base: 'Plus+Jakarta+Sans:wght@400;500;600;700;800',
  ta: 'Noto+Sans+Tamil:wght@400;500;600;700;800',
  si: 'Noto+Sans+Sinhala:wght@400;500;600;700;800',
  hi: 'Noto+Sans+Devanagari:wght@400;500;600;700;800',
};

const loaded = new Set<string>();

export function loadFont(key: string): void {
  const family = FAMILIES[key];
  if (!family || loaded.has(key) || typeof document === 'undefined') return;
  loaded.add(key);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${family}&display=optional`; // optional: late ah vandhaa indha visit la maaththaadhu (page jump illa), cache la irundhu adutha visit
  document.head.appendChild(link);
}
