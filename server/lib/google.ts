// 🔵 "Sign in with Google": Google kuduththa ID token unmaiyaa nu Google kitta kettu check pannurom
// .env la GOOGLE_CLIENT_ID irundhaa mattum on (Google Cloud Console la create pannanum)

const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

// Google tokeninfo badhil (namakku theva padura fields mattum)
export interface GoogleTokenInfo {
  aud?: string;
  iss?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  exp?: string | number;
  name?: string;
}
type Verifier = (credential: string) => Promise<GoogleTokenInfo | null>;

async function askGoogle(credential: string): Promise<GoogleTokenInfo | null> {
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  if (!res.ok) return null;
  return (await res.json()) as GoogleTokenInfo;
}

let verifier: Verifier = askGoogle; // 🧪 tests la fake verifier podalaam (Google ku call pogaama)
export function setGoogleVerifier(fn: Verifier | null): void {
  verifier = fn ?? askGoogle;
}

// ✅ Sari na { googleId, email, name } tharum, illana null
export async function verifyGoogleToken(credential: unknown): Promise<{ googleId: string; email: string; name: string } | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId || typeof credential !== 'string' || credential.length > 4096) return null;
  const info = await verifier(credential).catch(() => null);
  if (!info) return null;
  const verified = info.email_verified === true || info.email_verified === 'true';
  const notExpired = Number(info.exp) * 1000 > Date.now();
  if (info.aud !== clientId || !GOOGLE_ISSUERS.includes(info.iss ?? '') || !verified || !notExpired || !info.email) return null;
  return { googleId: String(info.sub), email: String(info.email).toLowerCase(), name: String(info.name || info.email.split('@')[0]).slice(0, 60) };
}
