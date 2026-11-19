import express from 'express';
import { openApiSpec } from '../lib/openapi.ts';

// 📜 API docs: /api/openapi.json (machine ku) + /api/docs (manushangalukku, Swagger UI)
const router = express.Router();

const SWAGGER = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14';

router.get('/api/openapi.json', (req, res) => res.json(openApiSpec));

router.get('/api/docs', (req, res) => {
  const nonce = res.locals.nonce;
  // 🛡️ Intha page ku mattum: Swagger UI oda CDN files allow
  res.set(
    'Content-Security-Policy',
    [
      "default-src 'none'",
      `script-src ${SWAGGER}/ 'nonce-${nonce}'`,
      `style-src ${SWAGGER}/ 'unsafe-inline'`,
      "img-src 'self' data: https://cdn.jsdelivr.net",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
    ].join('; ')
  );
  res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Flowboard API docs</title>
  <link rel="stylesheet" href="${SWAGGER}/swagger-ui.css" />
  <style>body { margin: 0; } .topbar { display: none; }</style>
</head>
<body>
  <div id="swagger"></div>
  <script src="${SWAGGER}/swagger-ui-bundle.js"></script>
  <script nonce="${nonce}">
    SwaggerUIBundle({ url: '/api/openapi.json', dom_id: '#swagger', withCredentials: true, tryItOutEnabled: false });
  </script>
</body>
</html>`);
});

export default router;
