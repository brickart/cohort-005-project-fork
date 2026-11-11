# Running Notifications against Knock

`npm run dev` and `npm run test` need no credentials: Notifications go through
the local `NotificationService` (feed in `.notifications/store.json`, Emails in
`.outbox/`). `npm run dev:knock` runs Cadence against the real Knock
Development environment instead.

## Setup

1. Copy `.env.example` to `.env` (gitignored) and fill it in from the Knock
   dashboard (Developers → API keys, the In-app feed channel's id, and a
   service token for the CLI).
2. `npm run knock:push` pushes and commits everything in `.knock/`
   (workflows, layouts, partials) to the Development environment with
   `knock push --commit`. Run it whenever `.knock/` changes. Dashboard editing
   of content stays off; only branding, channels and providers live there.
3. `npm run dev:knock` starts the dev server with `.env` loaded. Cadence picks
   the Knock `NotificationService` whenever `KNOCK_API_SECRET_KEY` is set
   (never under vitest), and throws a clear error if
   `KNOCK_FEED_CHANNEL_ID` is missing.

Everything Knock is server-side (`@knocklabs/node`); no key, token or socket
reaches the browser. The Knock user id is `String(user.id)`; recipients are
identified inline when a workflow is triggered.

## Keys that must match the Knock dashboard

- **The `cadence` layout is keyed `default`.** It lives in
  `.knock/layouts/default/` (name "Cadence"), and every non-locked Email
  step uses `"layout_key": "default"`. Locked Emails use `cadence-locked`.
  Don't rename the directory or key to `cadence`: the workflows would point
  at a layout Knock doesn't have.
- **`"channel_key": "in-app-feed"`** in every workflow's In-app step must be
  the key of the In-app feed channel in the Knock dashboard (Integrations →
  Channels). If the dashboard channel has another key, the In-app step
  doesn't reach the feed Cadence reads. `KNOCK_FEED_CHANNEL_ID` is that same
  channel's id (a UUID), which the feed API needs.

## The drainer at boot

`app/entry.server.tsx` starts the drainer (a sweep at boot, then about once
a minute). `react-router dev` would only load it on the first request, so
`vite.config.ts` has a small dev-only plugin that loads the server build as
soon as the dev server is listening. `npm run dev`, `npm run dev:knock` and
`npm run start` therefore all sweep the outbox at boot.

`dev:knock` runs Node with
`--network-family-autoselection-attempt-timeout=500`: in the prototype a new
connection to Knock took about 7 s while Node fell back from IPv6 to IPv4.

## Launch prerequisites (not done)

- **A production Email provider behind Knock.** Development Email goes through
  Knock's test channel, which only reaches Knock account members (100/month).
  Production needs an owned sending domain with DNS (SPF, DKIM) and a provider
  configured in Knock (Resend or Postmark).
- **Removing "Powered by Knock"** from Emails and the feed, which needs a paid
  Knock plan (Starter).
- **The CI push/promote pipeline.** CI should run `knock push --commit` on
  merge to `main` (with a `KNOCK_SERVICE_TOKEN` secret) and
  `knock commit promote --to=production` on release. Until then, content is
  pushed by hand with `npm run knock:push`.
