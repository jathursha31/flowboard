// 🕓 "5 min ago" / "5 நிமிடங்களுக்கு முன்பு": browser oda Intl ovvoru mozhilayum solli tharum
export function timeAgo(date: string | number | Date, locale: string | undefined = 'en'): string {
  const seconds = Math.round((new Date(date).getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const abs = Math.abs(seconds);
  if (abs < 45) return rtf.format(0, 'second'); // "now"
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
  return rtf.format(Math.round(seconds / 86400), 'day');
}
