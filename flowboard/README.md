# Flowboard — React Landing Website

A modern, fully responsive landing site for a fictional project-management product, built with **React 18 + Vite**. No UI or animation libraries — just React, hooks and hand-written CSS.

## Features

- **Dark / light mode** — follows your system setting, remembers your choice
- **Sticky navbar** with blur effect, active-section highlighting and a slide-out mobile menu
- **Animated hero** with rotating headline words, floating cards and an animated chart mockup
- **Interactive Kanban demo** — add, delete, filter and drag tasks between columns (arrow buttons on mobile); saved in `localStorage`
- **Animated stat counters** that count up when scrolled into view
- **Pricing table** with monthly / yearly toggle
- **Testimonials carousel** — autoplay, pause on hover, swipe on touch devices
- **Accordion FAQ** with smooth height animation
- **Contact form** with live validation, character counter and success state
- Scroll-reveal animations, scroll progress bar, back-to-top button
- Accessible: keyboard focus styles, ARIA labels, respects `prefers-reduced-motion`
- Responsive breakpoints for desktop (> 1024px), tablet (≤ 1024px) and mobile (≤ 600px)

## Project structure

```
flowboard/
├── index.html
├── package.json
├── vite.config.js
├── public/
│   └── logo.svg
└── src/
    ├── main.jsx            # React entry point
    ├── App.jsx             # Page layout
    ├── index.css           # All styles, theme tokens, animations, breakpoints
    ├── hooks/
    │   ├── useTheme.js         # Dark/light mode
    │   ├── useInView.js        # Detects when elements enter the screen
    │   └── useScrollProgress.js
    └── components/
        ├── Navbar.jsx  Hero.jsx  Logos.jsx  Features.jsx
        ├── Demo.jsx  Stats.jsx  Pricing.jsx  Testimonials.jsx
        ├── FAQ.jsx  Contact.jsx  Footer.jsx  ScrollTop.jsx
        └── Reveal.jsx  Icon.jsx
```

## How to run it in VS Code

### 1. Install the prerequisites (one time)

- **Node.js 18 or newer** — download the LTS version from https://nodejs.org and install it.
- **VS Code** — https://code.visualstudio.com

Check Node is installed by opening a terminal and running:

```bash
node -v
npm -v
```

Both should print a version number.

### 2. Open the project

1. Unzip `flowboard.zip` somewhere convenient (e.g. `Documents/flowboard`).
2. Open VS Code → **File → Open Folder…** → choose the `flowboard` folder.
3. If VS Code asks *"Do you trust the authors?"*, click **Yes, I trust the authors**.

### 3. Open the terminal

In VS Code: **Terminal → New Terminal** (or press <kbd>Ctrl</kbd> + <kbd>`</kbd>).
Make sure the terminal path ends in `flowboard`.

### 4. Install dependencies

```bash
npm install
```

This creates a `node_modules` folder. It takes about a minute the first time.

### 5. Start the development server

```bash
npm run dev
```

Your browser should open automatically at **http://localhost:5173**. If it doesn't, <kbd>Ctrl</kbd> + click the link in the terminal.

Any change you save in `src/` updates the page instantly. Stop the server with <kbd>Ctrl</kbd> + <kbd>C</kbd>.

### 6. Build for production (optional)

```bash
npm run build     # outputs an optimised site to the dist/ folder
npm run preview   # serves the built site locally to check it
```

The `dist/` folder can be deployed to Netlify, Vercel, GitHub Pages or any static host.

## Testing responsiveness

In your browser press <kbd>F12</kbd> → click the **device toolbar** icon (or <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>M</kbd>) and pick iPhone, iPad or a custom width.

## Customising

- **Colours** — edit the variables at the top of `src/index.css` (`--primary`, `--accent`, …). Dark mode values are under `[data-theme='dark']`.
- **Text & content** — each section's data (features, plans, reviews, FAQs) is an array at the top of its component file.
- **Contact form** — `Contact.jsx` currently simulates sending. Replace the `setTimeout` in `onSubmit` with a real request (e.g. Formspree, EmailJS or your own API).

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `npm` is not recognized | Reinstall Node.js, then restart VS Code |
| Running scripts is disabled (Windows PowerShell) | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, or switch the terminal to **Command Prompt** via the ▾ next to `+` |
| Port 5173 already in use | Vite will pick the next free port automatically — use the link shown in the terminal |
| Blank page | Check the browser console (F12) and the terminal for errors |
