import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

// 🛡️ Security headers: browser ku "intha page ah eppadi safe ah handle pannanum" nu solra rules
// (helmet maari package theva illa, naame ezhudhirukkom: ovvonnum enna pannum nu theriyum)
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  // 🎲 Ovvoru request kkum puthu random "nonce": intha nonce irukkura <script> mattum thaan oadum
  const nonce = crypto.randomBytes(16).toString('base64');
  res.locals.nonce = nonce;

  res.set({
    // Server HTML pages (admin, login) ku: namma style + nonce script mattum, vera edhuvum illa
    'Content-Security-Policy': [
      "default-src 'none'",
      "style-src 'unsafe-inline'",
      `script-src 'nonce-${nonce}'`,
      "img-src 'self' data:",
      "form-action 'self'",
      "frame-ancestors 'none'", // vera website namma page ah <iframe> la podakoodaadhu (clickjacking)
      "base-uri 'none'",
    ].join('; '),
    'X-Content-Type-Options': 'nosniff', // file type ah browser "guess" pannakoodaadhu
    'X-Frame-Options': 'DENY', // pazhaya browsers ku clickjacking thaduppu
    'Referrer-Policy': 'strict-origin-when-cross-origin', // vera site ku full URL anuppaadhe
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()', // theva illaadha powers off
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
  });

  // 🔒 HTTPS la mattum (deploy apram): "inimel eppovum HTTPS la mattum vaa" nu browser ku sollu
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}
