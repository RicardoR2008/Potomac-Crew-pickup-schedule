# Pickup Schedule — Netlify deploy

A one-screen app showing garbage & recycling pickup for 4248 W. Potomac Ave (Chicago Blue Cart).

## What's here
- site/index.html — the app, fully self-contained
- netlify/functions/schedule.js — serverless function that pulls the live schedule from Recycle by City twice a day (cached) and hands it to the app
- netlify.toml — tells Netlify where everything is

## Deploy (GitHub -> Netlify, recommended)
1. Create a GitHub repo and push this folder's contents to its root.
2. On netlify.com: Add new site -> Import an existing project -> pick the repo.
3. Netlify reads netlify.toml automatically. Deploy. Done.

(Alternatively: install the Netlify CLI and run \`netlify deploy --prod\` from this folder.)

## Push notifications (Web Push, self-hosted)
Real push — fires even with the page closed.
1. Generate keys once: \`npx web-push generate-vapid-keys\`
2. In Netlify: Site settings -> Environment variables, add
   - VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (from step 1)
   - VAPID_SUBJECT = mailto:your@email.com
3. Redeploy. Then open the site, Settings (gear) -> Pickup reminders ON, allow notifications.
How it works: site/sw.js receives pushes; functions/subscribe.mjs stores each browser's
subscription in Netlify Blobs; functions/send-reminders.mjs runs on a schedule (7:00 PM and
5:30 AM Chicago time), checks if tomorrow/today is a pickup, and sends via web-push.
Dead subscriptions are pruned automatically. iPhone: requires Add to Home Screen (iOS 16.4+).
Without the env vars the app quietly falls back to in-tab reminders.

## How live pulling works
The browser can't read recyclebycity.com directly (cross-origin), so the function
fetches the page server-side and extracts the rules (garbage day, recycling day,
recycling week). If the fetch or parse ever fails, the app silently falls back to
the built-in rules: garbage every Thursday, recycling every other Tuesday.
The footer shows "Live from Recycle by City." when live data loaded.
