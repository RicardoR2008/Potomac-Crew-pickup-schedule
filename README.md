# Pickup Schedule — 4248 W. Potomac Ave

A one-screen app showing garbage & recycling pickup for 4248 W. Potomac Ave
(Chicago Blue Cart program). Hand-written implementation of the Claude Design
mockup `design-import/Pickup Schedule.dc.html` — no frameworks, no build step,
one self-contained HTML file (~30 KB).

## What's here
- `site/index.html` — the app, fully self-contained (vanilla JS + CSS)
- `site/sw.js` — service worker that shows incoming Web Push notifications
- `netlify/functions/schedule.js` — pulls the live schedule from Recycle by City twice a day (cached) and hands it to the app
- `netlify/functions/subscribe.mjs` — stores each browser's push subscription in Netlify Blobs
- `netlify/functions/send-reminders.mjs` — scheduled sender (7:00 PM & 5:30 AM Chicago time)
- `netlify.toml` — tells Netlify where everything is
- `design-import/` — the imported Claude Design project (reference only, not deployed)

## Run locally
Any static server over `site/` works, e.g.:

```
npx serve site
```

Without the Netlify functions the app quietly falls back to the built-in rules
(garbage every Thursday, recycling every other Tuesday, anchored Aug 11, 2026).

## Deploy (GitHub -> Netlify, recommended)
1. Create a GitHub repo and push this folder's contents to its root.
2. On netlify.com: Add new site -> Import an existing project -> pick the repo.
3. Netlify reads `netlify.toml` automatically. Deploy. Done.

(Alternatively: install the Netlify CLI and run `netlify deploy --prod` from this folder.)

## Push notifications (Web Push, self-hosted)
Real push — fires even with the page closed.
1. Generate keys once: `npx web-push generate-vapid-keys`
2. In Netlify: Site settings -> Environment variables, add
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (from step 1)
   - `VAPID_SUBJECT` = mailto:your@email.com
3. Redeploy. Then open the site, Settings (gear) -> Pickup reminders ON, allow notifications.

How it works: `site/sw.js` receives pushes; `subscribe.mjs` stores each browser's
subscription in Netlify Blobs; `send-reminders.mjs` runs on a schedule (7:00 PM and
5:30 AM Chicago time), checks if tomorrow/today is a pickup, and sends via web-push.
Dead subscriptions are pruned automatically. iPhone: requires Add to Home Screen (iOS 16.4+).
Without the env vars the app quietly falls back to in-tab reminders.

## How live pulling works
The browser can't read recyclebycity.com directly (cross-origin), so the function
fetches the page server-side and extracts the rules (garbage day, recycling day,
recycling week). If the fetch or parse ever fails, the app silently falls back to
the built-in rules. The footer shows "Live from Recycle by City." when live data loaded.
