import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { loadFont } from './fonts.ts';

loadFont('base'); // 🔤 page block aagaama font

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// 📱 Service worker (offline): build panna version la mattum (dev la pazhaya files cache aagi kuzhappum)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}
