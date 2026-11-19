import { beforeAll, describe, expect, it } from 'vitest';
import { LANGUAGES, loadLanguage, translations } from '../i18n.ts';
import type { Lang, Translations } from '../i18n.ts';

const codes = LANGUAGES.map((l) => l.code as Lang);
// ⚡ Mozhigal thani files: test munnaadi ellaathaiyum load pannu
beforeAll(async () => {
  await Promise.all(codes.map(loadLanguage));
});
const all = (code: Lang): Translations => translations[code] as Translations;

// 🌐 Ella mozhiyilum ore keys irukkanum (onnu marandhaa English la varum, aana adhai pidikkanum)
const keysOf = (obj: object, prefix = ''): string[] =>
  Object.entries(obj).flatMap(([k, v]): string[] => (v && typeof v === 'object' && !Array.isArray(v) ? keysOf(v, `${prefix}${k}.`) : [`${prefix}${k}`]));

describe('translations', () => {
  const english = keysOf(translations.en).sort();

  it.each(codes)('%s has every English key', (code) => {
    expect(keysOf(all(code)).sort()).toEqual(english);
  });

  it('keeps list lengths the same (features, FAQ, pricing plans)', () => {
    for (const code of codes) {
      const t = all(code);
      expect(t.features.items).toHaveLength(translations.en.features.items.length);
      expect(t.faq.items).toHaveLength(translations.en.faq.items.length);
      expect(t.pricing.plans).toHaveLength(3);
    }
  });

  it('puts the rotating word placeholder in every hero', () => {
    for (const code of codes) expect(all(code).hero.lines.join(' ')).toContain('{word}');
  });
});
