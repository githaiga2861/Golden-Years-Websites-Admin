# Golden Years Admin App

A single unified, installable PWA admin dashboard for both:
- Golden Years Home Health (goldenyearshomehealthllc.com) — Articles, Enquiries, Jobs, Applications
- Golden Years Home Care WA (goldenyearshomecarewa.com) — Leads

## Setup

1. Create a new GitHub repo (e.g. `Golden-Years-Admin-App`), add these files to the root.
2. Import the repo into Vercel (vercel.com → Add New → Project → Import Git Repository).
   No build step needed — it's a static site. Leave build settings as default/none.
3. Vercel will assign a URL like `golden-years-admin-app.vercel.app`. You can add a custom domain later if you want (e.g. `admin.goldenyearshomehealthllc.com`).
4. Password: `GoldenYears2026` (same as both websites' admin pages — change it by editing the `ADMIN_PW` constant near the top of the `<script>` block in index.html).

## How it works

- On open: pick which site to manage.
- Enter the shared password.
- Main Health site dashboard has 4 tabs: Articles (approve/publish/delete), Enquiries (view/reply), Jobs (full add/edit/delete), Applications (view resumes/reply).
- Home Care WA dashboard shows Leads only (view/reply/delete).
- The app nags to install itself (bottom banner) on every load until it's actually installed as a PWA — this is intentional per the design brief. Dismissing the banner only hides it for that session; it returns on the next visit until installed.
- Connects directly to both sites' existing Supabase projects — no new database needed.

## Files
- `index.html` — the whole app (single page)
- `manifest.json` — PWA manifest
- `sw.js` — service worker (enables install + basic offline caching)
- `icons/` — app icons (192px, 512px) using the real Golden Years logo
