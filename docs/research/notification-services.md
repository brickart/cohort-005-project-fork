# Which notification service fits Cadence?

Research for [#6](https://github.com/brickart/cohort-005-project-fork/issues/6), under the map [#5](https://github.com/brickart/cohort-005-project-fork/issues/5). The choice itself is made in [#10](https://github.com/brickart/cohort-005-project-fork/issues/10). This note only gathers facts.

Read in November 2026, from official docs and pricing pages only. Vendors change prices and plan limits often, so check the linked page again before relying on any number.

## What Cadence needs

- Route each **Notification** to three **Channels**: Email, In-app and Browser (Web Push).
- Keep Postmark (`app/lib/mailer.server.ts`) as the email provider if the service allows it.
- Support **Notification Preferences** per user, per Notification type and per Channel, plus some mandatory Notifications that ignore preferences (still open on the map).
- **Standing rule:** local dev and `npm run test` must work with no service credentials, the way the `.outbox/` fallback works today, and Notifications must be observable by switching users in the DevUI panel.

## Finding that applies to every vendor

**None of the five services can run locally without credentials.** Each one is a hosted API, and every prebuilt in-app component fetches its feed from that vendor's cloud. The nearest options:

- Knock has a `sandbox_mode` trigger setting. It still needs an API key.
- Courier has a Test environment. It still needs a Test key.
- Novu has a self-hosted community edition. It needs MongoDB, Redis and S3-compatible storage.

So whichever service is chosen, Cadence needs its own seam, as `MailTransport` is for email today:

- A `NotificationTransport`-style interface.
- A credential-free local implementation, for example one that writes Notifications to SQLite or `.outbox/`.
- An In-app feed that the DevUI user switch can show without the vendor.

This weakens the case for vendor-hosted feed components in dev and test. It favours vendors with **headless** client APIs, or rendering the In-app feed from Cadence's own UI.

## Per-service findings

### Knock

| Criterion            | Finding                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Free tier            | Free plan at $0: 10,000 messages a month, unlimited workflows, profiles and channels, 30-day log retention. Knock branding cannot be removed on Free. The next tier, Starter, costs $250 a month for 50k messages. [pricing](https://knock.app/pricing)                                                                                                                                                                   |
| In-app feed          | `@knocklabs/react` provides `KnockProvider`, `KnockFeedProvider`, `NotificationIconButton`, `NotificationFeedPopover` and `NotificationFeed`. Theming uses `--rnf-` CSS variables, with `colorMode` for light or dark. [feed](https://docs.knock.app/in-app-ui/react/feed) Headless hooks: `useKnockClient`, `useNotifications` and `useNotificationStore`. [headless](https://docs.knock.app/in-app-ui/react/headless/feed) |
| Feed security        | By default anyone with the feed ID can read a feed. For production, enable enhanced security mode and pass a signed `userToken`. [feed](https://docs.knock.app/in-app-ui/react/feed)                                                                                                                                                                                                                                     |
| Browser (Web Push)   | No native web push channel. Browser push goes through Firebase Cloud Messaging: an FCM push channel, a Firebase service worker, and the FCM token stored as channel data on the user. [FCM web push tutorial](https://docs.knock.app/tutorials/sending-web-push-notifications-with-fcm)                                                                                                                                  |
| Postmark             | **Yes, bring your own.** Configure the Postmark server API key and a from address. Messages go out on the `outbound` stream by default. An optional incoming webhook maps Postmark delivery and bounce events onto Knock message status. [Postmark](https://docs.knock.app/integrations/email/postmark)                                                                                                               |
| Preferences          | Can be set per `workflows`, per `categories`, per `channel_types` and per individual `channels`. Anything unset defaults to true. There is a hosted preference page, reached through a signed URL. No prebuilt React preferences component exists, so you build your own UI on `getPreferences` and `setPreferences`. [overview](https://docs.knock.app/preferences/overview), [React](https://docs.knock.app/in-app-ui/react/preferences) |
| Local dev / test     | Separate Development and Production environments, each with its own API keys. [environments](https://docs.knock.app/concepts/environments) The trigger setting `sandbox_mode` generates messages without delivering them to providers. [trigger API](https://docs.knock.app/send-notifications/triggering-workflows/api) There is no offline mode.                                                                     |
| SDK / ids / workflows | Workflows are triggered through the API. A recipient is a string user ID, or an inline recipient object that Knock identifies before the run. [trigger API](https://docs.knock.app/send-notifications/triggering-workflows/api) Workflows and templates are edited in the dashboard, or pulled and pushed as local files with the Knock CLI, which can run in CI. [CLI](https://docs.knock.app/developer-tools/knock-cli) |
| Webhooks             | Outbound message events: `message.sent`, `delivered`, `undelivered`, `bounced`, `seen`, `read`, `interacted` and others. [event types](https://docs.knock.app/developer-tools/outbound-webhooks/event-types)                                                                                                                                                                                                             |

### Novu

| Criterion            | Finding                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Free tier            | Free plan at $0: 10,000 workflow runs a month, **up to 5 workflows**, 2 environments, 3 team members, unlimited subscribers, **24-hour activity feed retention**. Pro starts at $30 a month. [pricing](https://novu.co/pricing)                                                                                                                                                                       |
| In-app feed          | `<Inbox />` from `@novu/react` includes a bell, a notification list and a **built-in preferences view**. [inbox](https://docs.novu.co/platform/inbox/overview) Theming uses an `appearance` prop with `baseTheme`, `variables`, `elements` (inline styles, Tailwind or CSS modules), `icons` and `animations`. [styling](https://docs.novu.co/platform/inbox/configuration/styling) Headless hooks: `useNotifications`, `usePreferences` and `useNovu`, or `@novu/js` outside React. [headless](https://docs.novu.co/platform/inbox/headless-mode), [usePreferences](https://docs.novu.co/platform/sdks/react/hooks/use-preferences) |
| Browser (Web Push)   | Through push providers: FCM (web push), Pushpad (web-focused), OneSignal, Pusher Beams, or a Push Webhook to your own endpoint. [push](https://docs.novu.co/platform/integrations/push), [FCM](https://docs.novu.co/platform/integrations/push/fcm)                                                                                                                                                    |
| Postmark             | **Yes, bring your own.** Configure a Postmark server API token and a verified from address. [Postmark](https://docs.novu.co/platform/integrations/email/postmark)                                                                                                                                                                                                                                     |
| Preferences          | Three layers: workflow defaults, subscriber global preferences, and subscriber per-workflow preferences. The most specific layer wins, per Channel. **Critical workflows** ignore subscriber preferences and are hidden from the preferences UI, which maps directly onto Cadence's open question about mandatory Notifications. [preferences](https://docs.novu.co/platform/concepts/preferences) |
| Local dev / test     | Workflows can live in TypeScript code (the Novu Framework), served from a Bridge endpoint in your app. [framework](https://docs.novu.co/framework/overview) `npx novu dev` opens a Local environment in the Novu Cloud dashboard through a cloud-proxied tunnel, so it is not offline. [studio](https://docs.novu.co/framework/studio) A self-hosted community edition exists. It needs MongoDB, Redis and S3-compatible storage, and lacks some cloud-only features. [self-hosting](https://docs.novu.co/community/self-hosting-novu/overview) |
| SDK / ids / workflows | `@novu/api` exposes `novu.trigger({ to: { subscriberId, email, ... }, workflowId, payload })`. [TS SDK](https://docs.novu.co/platform/sdks/server/typescript) Workflows are defined in the dashboard or in code.                                                                                                                                                                                       |
| Webhooks             | Outbound webhooks (`message.sent`, `delivered`, `failed`, `seen`, `read` and others) are available **only on the Team and Enterprise plans**. Team starts at $250 a month. [webhooks](https://docs.novu.co/platform/developer/webhooks/webhooks)                                                                                                                                                      |

### Courier

| Criterion            | Finding                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Free tier            | Developer plan, free: 10,000 sends a month. Business costs $0.005 per send, pay as you go. The pricing page does not say which plans include Inbox or Preferences. [pricing](https://www.courier.com/pricing)                                                                                                                                                             |
| In-app feed          | `@trycourier/courier-react` (v9) provides `<CourierInbox />` and the `useCourier` hook. It is themed with `CourierInboxTheme`. You can supply your own views while the SDK manages messages, or build on the low-level APIs. Your backend signs a JWT for the user. [inbox](https://www.courier.com/docs/platform/inbox/inbox-overview)                                |
| Browser (Web Push)   | Push providers include FCM, OneSignal, MagicBell, Pusher Beams and others. [push providers](https://www.courier.com/docs/integrations/push/overview) The docs do not show a first-party browser push path. The FCM page covers only Android and iOS. [FCM](https://www.courier.com/docs/external-integrations/push/firebase-fcm)                                       |
| Postmark             | **Yes, bring your own.** Configure a server API token and a from address. Overrides cover message stream, sender and Postmark templates. [Postmark](https://www.courier.com/docs/external-integrations/email/postmark)                                                                                                                                                |
| Preferences          | Subscription topics have a default of `OPTED_IN`, `OPTED_OUT` or **`REQUIRED`**. Required topics cannot be opted out of. Users can pick Channels per section. Both a **hosted preference page** and an **embeddable preference center** are available. [preferences](https://www.courier.com/docs/platform/preferences/embedding-preferences)                     |
| Local dev / test     | Every workspace has Production and Test environments. A Test key is the only "test mode". In Test, the built-in email provider only delivers to the signup address. [environments](https://www.courier.com/docs/platform/workspaces/environments-api-keys) No offline mode.                                                                                          |
| SDK / ids / workflows | `@trycourier/courier`: `client.send.message({ to: { user_id }, template, data })`. The profile must exist first, created with `client.profiles.create`. [Node SDK](https://www.courier.com/docs/sdk-libraries/node) Templates are built in Design Studio, a dashboard tool.                                                                                         |
| Webhooks             | Outbound `message:updated` events report statuses such as SENT and DELIVERED, signed with the `courier-signature` header. [webhooks](https://www.courier.com/docs/platform/workspaces/outbound-webhooks)                                                                                                                                                             |

### MagicBell

| Criterion            | Finding                                                                                                                                                                                                                                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Free tier            | Builder plan at $0: **1,000 deliveries a month**, 1 project, unlimited users. Startup costs $249 a month. [pricing](https://www.magicbell.com/pricing)                                                                                                                                                                       |
| In-app feed          | `@magicbell/react` provides `ContextProvider`, `FloatingInbox`, `Inbox`, `InlineNotification` and `ToastContainer`. Theming uses `--magicbell-*` CSS variables and class names. It needs a user JWT signed on your server. The docs do not mention headless hooks. [React](https://www.magicbell.com/docs/libraries/magicbell-react)          |
| Browser (Web Push)   | **First-party Web Push channel.** You supply the VAPID keys. The `WebPushButton` component plus a service worker handle subscription. [web push](https://www.magicbell.com/docs/channels/web_push), [React](https://www.magicbell.com/docs/libraries/magicbell-react)                                                       |
| Postmark             | **Not listed in the docs.** The email providers are SES, Mailgun, SendGrid, SMTP and Ping Email. [docs](https://www.magicbell.com/docs) Postmark would have to go through the generic SMTP provider. [SMTP](https://www.magicbell.com/docs/channels/email/smtp) That route is unverified.                                         |
| Preferences          | `GET` and `PUT /channels/user_preferences` take categories, each with per-Channel `enabled` flags. The React component `UserPreferences` toggles Channels per category. [API](https://www.magicbell.com/docs/api/reference), [React](https://www.magicbell.com/docs/libraries/magicbell-react)                                  |
| Local dev / test     | The docs show no sandbox or test mode.                                                                                                                                                                                                                                                                                       |
| SDK / ids / workflows | Clients: `magicbell-js` (browser and Node), Go, and a CLI. Recipients in `POST /broadcasts` use `external_id` or `email`. A workflow-run endpoint exists. [API](https://www.magicbell.com/docs/api/reference)                                                                                                                 |
| Webhooks             | The API reference shows no outbound webhooks. Delivery is audited through `GET /events`. [API](https://www.magicbell.com/docs/api/reference)                                                                                                                                                                                 |

### OneSignal

| Criterion            | Finding                                                                                                                                                                                                                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Free tier            | Free: web push to up to 10,000 subscribers per send, 10,000 email sends a month, and in-app messages for up to 1,000 MAU. Growth starts at $19 a month. [pricing](https://onesignal.com/pricing)                                                                                                                         |
| In-app feed          | **No In-app feed for web.** OneSignal's "in-app messages" are transient campaign messages, available "only ... for mobile apps with the OneSignal mobile SDK installed". [in-app](https://documentation.onesignal.com/docs/en/in-app-messages-setup) The docs show no inbox or feed component.                          |
| Browser (Web Push)   | **Core product.** The Web SDK provides `OneSignal.login(external_id)`, slidedown permission prompts and category prompts, and service worker configuration. [web SDK](https://documentation.onesignal.com/docs/en/web-sdk-reference)                                                                                    |
| Postmark             | **No.** Email goes through OneSignal Email, or through SendGrid, Mailgun or Mandrill as external providers. [email setup](https://documentation.onesignal.com/docs/en/email-setup)                                                                                                                                       |
| Preferences          | No per-type, per-Channel preference model. The closest feature is tags plus a category slidedown prompt with up to 10 categories, which you would build into a preference center yourself. [web SDK](https://documentation.onesignal.com/docs/en/web-sdk-reference)                                                       |
| Local dev / test     | The docs show no sandbox. Debug logging is available with `OneSignal.Debug.setLogLevel`. [web SDK](https://documentation.onesignal.com/docs/en/web-sdk-reference)                                                                                                                                                         |
| SDK / ids / workflows | `@onesignal/node-onesignal` exposes `createNotification`, targeting `include_aliases: { external_id: [...] }`. [server SDK](https://documentation.onesignal.com/docs/en/server-sdk-reference)                                                                                                                             |

## Comparison

| | Knock | Novu | Courier | MagicBell | OneSignal |
| --- | --- | --- | --- | --- | --- |
| Free tier | 10k messages a month, Knock branding | 10k runs a month, **5 workflows**, 24h log | 10k sends a month | **1k deliveries a month** | 10k email, web push to 10k subscribers |
| In-app React feed | Yes, CSS vars | Yes, `appearance` prop | Yes, theme object | Yes, CSS vars | **No (web)** |
| Headless In-app API | Yes (hooks) | Yes (hooks, `@novu/js`) | Yes (`useCourier`, custom views) | Not documented | n/a |
| Browser (Web Push) | Via FCM | Via FCM, Pushpad and others | Via a provider (OneSignal, MagicBell…) | **Native** | **Native** |
| Keep Postmark | **Yes**, plus status webhook | **Yes** | **Yes** | SMTP only, unverified | **No** |
| Per-type, per-Channel preferences | Yes (workflow, category, channel type) | Yes (global and per workflow) | Yes (topics, Channel choice) | Yes (category × Channel) | No |
| Mandatory Notifications | Not built in as a flag (found none) | **Critical workflows** | **Required topics** | Not documented | n/a |
| Preferences UI | Hosted page only | **Built into Inbox** + hook | **Hosted + embeddable** | React component | Build your own |
| Test story | Dev env + `sandbox_mode` | Dev env, code-first local tunnel, self-host | Test env | None documented | None documented |
| Works with no credentials | No | No (only by self-hosting) | No | No | No |
| Workflows in code | CLI pull/push | **TypeScript Framework** | Dashboard | Dashboard / API | Dashboard / API |
| Delivery webhooks | Yes (plan not stated) | Team plan and up only | Yes | Polling `/events` | (not researched) |

## Recommendation

**Drop OneSignal and MagicBell.**

- OneSignal has no web In-app feed and cannot keep Postmark.
- MagicBell's free tier is 1,000 deliveries a month, and it has no documented Postmark support.
- MagicBell is the best fit only if Browser becomes the driving Channel, because it has native web push and a `UserPreferences` component.

**Shortlist Knock and Novu for #10. Courier is a close third.**

**Knock** fits the stated constraints most cleanly:

- Postmark stays as the email provider, and its delivery status flows back into Knock.
- The free tier is enough for v1, with no cap on the number of workflows.
- Preferences cover type × Channel.
- Headless hooks make a Cadence-rendered feed easy, which the no-credentials rule pushes toward anyway.
- `sandbox_mode` and separate environments help staging.

Knock's costs:

- Web push needs a Firebase project.
- There is no embeddable preferences component, so Cadence builds its own preferences page.
- There is no mandatory-Notification flag; Cadence would enforce that itself.

**Novu** has the richest out-of-the-box UI:

- Inbox with built-in preferences.
- Critical workflows for mandatory Notifications.
- TypeScript workflows in the repo.

Novu's free tier is tight:

- 5 workflows is likely fewer than Cadence's Notification catalogue (#5).
- 24-hour log retention.
- Delivery webhooks need the $250 Team plan.

**Courier** matches Knock on Postmark and has Required topics plus an embeddable preference center. Its templates live in the dashboard rather than the repo, and the docs show no first-party web push.

**Whatever is picked:** the standing rule means Cadence needs a local `NotificationTransport`, alongside the existing `MailTransport` and `.outbox/`, that stores In-app Notifications locally so dev, tests and the DevUI user switch work offline. Weigh this when reconciling the prototype with prebuilt components.

## Gaps and caveats

- Knock's Node SDK package name was not confirmed from a docs page (likely `@knocklabs/node`).
- Courier's Inbox and Preferences plan eligibility is not stated on the pricing page.
- MagicBell via Postmark SMTP is untested.
- Novu self-hosted feature gaps are listed on a comparison page that was not read.
