import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 🛡️ Content Security Policy: website la endha scripts / styles / fonts load aagalaam nu browser ku rules
// Build (production) la mattum: dev la Vite oda hot-reload inline script ah block pannidum
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com/gsi/client", // namma JS + Google sign-in
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://accounts.google.com/gsi/",
  "frame-src https://accounts.google.com/gsi/",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function cspMeta() {
  return {
    name: 'flowboard-csp',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }],
  };
}

export default defineConfig({
  plugins: [react(), cspMeta()],
  // 🧪 Component tests (Vitest): browser illaama, jsdom la
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
  },
  server: {
    port: 5173,
    open: !process.env.API_URL, // browser tests la Chrome window thaanaa thirakka vendaam
    // 🆕 '/api' nu aarambikkura ellaathaiyum server (3001) ku anuppu
    proxy: {
      '/api': process.env.API_URL || 'http://localhost:3001', // browser tests vera server ku anuppum
    },
  },
});
