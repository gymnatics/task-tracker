# Task Tracker (Checklist + Calendar + Recurrence)

React + TypeScript + Vite + Tailwind. Local storage. SG timezone.
In‑app + EmailJS notifications. Electron packaging for desktop installers.

## Features
- Checklist with complete, pause, edit, delete
- Month calendar with recurring tasks (daily/weekly/monthly)
- Paused tasks hidden on calendar, visible in list
- Categories/tags and search
- Import/Export JSON backup
- In‑app notifications (Notification API)
- Email notifications (EmailJS)
- First‑run onboarding collects email + EmailJS keys (no verification)
- Timezone: Asia/Singapore

## Quickstart (web)
```bash
npm i
cp .env.example .env   # fill VITE_EMAILJS_* or leave blank and use onboarding
npm run dev
```

## Desktop app
Electron wraps the built app for macOS/Windows/Linux.
```bash
npm run build          # web build -> dist/
npm run build:desktop  # creates DMG/NSIS/AppImage
```

## GitHub push
```bash
git init
git add .
git commit -m "feat: task tracker with onboarding, email, electron"
git branch -M main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

## EmailJS
1) Create account at https://www.emailjs.com
2) Add Email Service and Template. Copy Service ID, Template ID, Public Key.
3) Either fill `.env` (`VITE_EMAILJS_*`) or enter values in onboarding/Settings.
