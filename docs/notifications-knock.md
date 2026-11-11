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
