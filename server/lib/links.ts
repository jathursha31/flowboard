// 🔗 Task links: Google Drive / Docs / Sheets / Slides (illa vera https link) ah task la serkka
// File ah namma server la vaikka maattom: link mattum. Google la share settings padi thaan yaar paakkalaam nu mudivu

export type LinkKind = 'drive' | 'docs' | 'sheets' | 'slides' | 'forms' | 'link';
export const MAX_LINKS = 10;

// https:// mattum (javascript: maari aabaththaana links koodaadhu)
export function cleanLinkUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 500) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function linkKind(href: string): LinkKind {
  const url = new URL(href);
  if (url.hostname === 'drive.google.com') return 'drive';
  if (url.hostname === 'docs.google.com') {
    const kind = url.pathname.split('/')[1];
    if (kind === 'document') return 'docs';
    if (kind === 'spreadsheets') return 'sheets';
    if (kind === 'presentation') return 'slides';
    if (kind === 'forms') return 'forms';
    return 'drive';
  }
  return 'link';
}

const DEFAULT_TITLES: Record<LinkKind, string> = {
  drive: 'Google Drive file',
  docs: 'Google Doc',
  sheets: 'Google Sheet',
  slides: 'Google Slides',
  forms: 'Google Form',
  link: 'Link',
};

// Title kudukkalana: Google na vagai peyar, illana website peyar (example.com)
export function linkTitle(raw: unknown, href: string, kind: LinkKind): string {
  const given = typeof raw === 'string' ? raw.trim().slice(0, 80) : '';
  if (given) return given;
  return kind === 'link' ? new URL(href).hostname.replace(/^www\./, '') : DEFAULT_TITLES[kind];
}
