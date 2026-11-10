# Can Knock render Cadence's bell and channel-first preferences?

Research note for the ticket "Can the chosen service render Cadence's bell and channel-first preferences?". Researched 2026-11-10 against Knock's docs and source: `knocklabs/javascript` `main` (`@knocklabs/react` 0.15.1, `@knocklabs/react-core` 0.17.1) and `knocklabs/knock-node` v1.41.0.

**Short answer:** yes, Knock can supply everything the UI needs. Its prebuilt UI fits poorly, though. Cadence should build all three pieces (bell, popover, preferences card) with its own components. The data comes from Knock's feed and preferences APIs, called from **server-side** loaders and actions through a Cadence-owned interface. Channel Mute and "Mute everything" can be expressed in Knock's PreferenceSet without losing per-item choices. Locked rows map to Knock's workflow-level "Override recipient preferences" setting, so the brief's claim that Knock has no mandatory flag needs correcting.

Note: `package.json` pins `react-router` 8.3.0, not v7. Nothing below depends on the difference.

---

## 1. Prebuilt feed components vs headless

### What the prebuilt components give

| Target behaviour | Prebuilt support | Source |
| --- | --- | --- |
| Red count, `9+` above nine, hidden at zero | Yes. `UnseenBadge` returns `null` when the count is 0, and `formatBadgeCount` returns `"9+"` when `count > 9`. Pass `badgeCountType="unread"` (the default is `"unseen"`). | [UnseenBadge.tsx](https://github.com/knocklabs/javascript/blob/main/packages/react/src/modules/feed/components/UnseenBadge/UnseenBadge.tsx), [react-core utils.ts](https://github.com/knocklabs/javascript/blob/main/packages/react-core/src/modules/core/utils.ts) |
| Bell icon and button styling | The icon is a fixed internal `BellIcon`. You can only restyle it with `--rnf-*` CSS variables or by replacing the `rnf-` classes. | [NotificationIconButton.tsx](https://github.com/knocklabs/javascript/blob/main/packages/react/src/modules/feed/components/NotificationIconButton/NotificationIconButton.tsx), [theme.css](https://github.com/knocklabs/javascript/blob/main/packages/react/src/theme.css), [React feed docs](https://docs.knock.app/in-app-ui/react/feed) |
| No tabs or filters; header with "Mark all read" and a gear | The default header has a status `Dropdown` (All/Unread/Read). You need `renderHeader` to replace it. | [NotificationFeedHeader.tsx](https://github.com/knocklabs/javascript/blob/main/packages/react/src/modules/feed/components/NotificationFeed/NotificationFeedHeader.tsx) |
| Per-type icon, bold title, body, relative time, blue dot | The default `NotificationCell` shows an avatar, the `body` HTML, a timestamp, an unread dot and an **archive button**. It has no title or icon slot. You need `renderItem`. | [NotificationCell.tsx](https://github.com/knocklabs/javascript/blob/main/packages/react/src/modules/feed/components/NotificationCell/NotificationCell.tsx) |
| Click: mark read, navigate, close | A cell click always calls `feedClient.markAsInteracted`, which sets `read_at` too. Without `onNotificationClick`, the default handler does `window.location.assign(url)`, a full page reload. Closing the popover is the caller's job. | NotificationCell.tsx, [feed.ts](https://github.com/knocklabs/javascript/blob/main/packages/client/src/clients/feed/feed.ts) |
| "You're all caught up" | Possible with `EmptyComponent`, or the `emptyFeedTitle` / `emptyFeedBody` i18n keys. | [NotificationFeed.tsx](https://github.com/knocklabs/javascript/blob/main/packages/react/src/modules/feed/components/NotificationFeed/NotificationFeed.tsx), [EmptyFeed.tsx](https://github.com/knocklabs/javascript/blob/main/packages/react/src/modules/feed/components/EmptyFeed/EmptyFeed.tsx) |
| Branding | The feed renders "Powered by Knock" when `settings.features.branding_required` is set, which is plan-dependent. | NotificationFeed.tsx |
| Popover | Built on `@popperjs/core`. The default `onOpen` calls `markAllAsSeen`. | [NotificationFeedPopover.tsx](https://github.com/knocklabs/javascript/blob/main/packages/react/src/modules/feed/components/NotificationFeedPopover/NotificationFeedPopover.tsx) |

Once `renderHeader`, `renderItem`, `EmptyComponent` and `onNotificationClick` are overridden, Knock still supplies the Popper shell, infinite scroll and the badge. Everything Cadence actually sees is custom code, plus a second styling system (`rnf-` CSS) sitting next to Tailwind and the shadcn/radix components the app already uses (`app/components/ui/*`, `radix-ui` in `package.json`).

### Real-time can't be turned off through the React providers

- `KnockFeedProvider` → `useNotifications` always calls `feedClient.listenForUpdates()`. That joins the Phoenix socket channel, and the socket connects on first join. Sources: [useNotifications.ts](https://github.com/knocklabs/javascript/blob/main/packages/react-core/src/modules/feed/hooks/useNotifications.ts), [KnockFeedProvider.tsx](https://github.com/knocklabs/javascript/blob/main/packages/react-core/src/modules/feed/context/KnockFeedProvider.tsx), [socket-manager.ts](https://github.com/knocklabs/javascript/blob/main/packages/client/src/clients/feed/socket-manager.ts).
- `auto_manage_socket_connection` only disconnects the socket while the page is hidden, and its delay defaults to 2000 ms. `__experimentalCrossBrowserUpdates` adds a `BroadcastChannel`. Neither option disables real-time. See the [React feed docs](https://docs.knock.app/in-app-ui/react/feed) and [api.ts](https://github.com/knocklabs/javascript/blob/main/packages/client/src/api.ts).
- To avoid the socket, use `@knocklabs/client` directly: call `knock.feeds.initialize(channelId)` and `feed.fetch()`, and never call `listenForUpdates()`. The feed constructor doesn't join the channel on its own; `initializeRealtimeConnection` only rejoins if the feed was already subscribed (feed.ts). The simpler route is not to run the feed in the browser at all (see below).

### Recommendation for the bell and popover: headless, served from the server

Since the feed only needs to refresh on load or navigation, the browser doesn't need a Knock SDK. A React Router loader can read the feed server-side, and actions can change its status:

- Read: `client.users.feeds.listItems(userId, channelId)`, which is `GET /v1/users/{user_id}/feeds/{channel_id}` and returns `entries`, `meta.unread_count` and `page_info`.
- Mark one read: `client.messages.markAsRead(messageId)`.
- Mark all read: `client.messages.batch.markAsRead({ message_ids })` for the loaded items. This is synchronous. The alternative, `client.channels.bulk.updateMessageStatus(channelId, "read", { recipient_ids: [userId] })`, returns an async `BulkOperation`, so the next load may still show the items as unread.

All of these are in [knock-node api.md](https://github.com/knocklabs/knock-node/blob/main/api.md).

The server-side route avoids the socket, the public key and JWT signing in the browser, and the second CSS system. Cadence's existing `useFetcher` and revalidation patterns handle refresh.

If client-side reads are wanted later, the next-best option is `@knocklabs/client` without `listenForUpdates`. The prebuilt `@knocklabs/react` feed components come last.

## 2. Feed item data

A feed item ([interfaces.ts](https://github.com/knocklabs/javascript/blob/main/packages/client/src/clients/feed/interfaces.ts); [list_items API](https://docs.knock.app/api-reference/users/feeds/list_items)) carries:

- **`blocks`**: content rendered from the in-app template. Use `blocks.find(b => b.name === "body").rendered` for the HTML body, and the `action_url` text block's `rendered` field for the target URL. This is how Knock's own `NotificationCell` reads them. The in-app template has a markdown body and an optional click action URL, which can be static or Liquid. A template can also have one or two button variants, which Cadence doesn't need. There is **no title field** ([in-app channel docs](https://docs.knock.app/integrations/in-app/knock)).
- **`data`**: the workflow's trigger data. By default the whole trigger payload is returned, and it can be narrowed with the channel's API response filter ([in-app channel docs](https://docs.knock.app/integrations/in-app/knock)). The default `mode: "compact"` drops nested objects and arrays from `data`, so keep it flat (interfaces.ts).
- **`source.key`**: the workflow key. `source.categories` is also included ([messages/interfaces.ts](https://github.com/knocklabs/javascript/blob/main/packages/client/src/clients/messages/interfaces.ts)).
- **Status fields**: `read_at`, `seen_at`, `interacted_at`, `archived_at`, `inserted_at`. Feed metadata has `unread_count`, `unseen_count` and `total_count`.

Suggested mapping:

| UI element | Knock source |
| --- | --- |
| Per-type icon | `source.key` (workflow key), looked up in Cadence's 10-Notification catalogue |
| Title | `data.title`, set by Cadence when it triggers the workflow, so it stays flat. Alternatively, derive it from the catalogue plus `data`. |
| Short body | `blocks[name=body].rendered` (Liquid template in Knock) |
| Target URL | `blocks[name=action_url].rendered`. Use a relative path so Cadence can `navigate()` to it. |
| Relative time | `inserted_at` |
| Bold title and blue dot | `read_at === null` |
| Unread count on the bell | `meta.unread_count`. Don't use `unseen_count`: it is Knock's default badge, but it resets as soon as the feed is opened ([in-app channel docs](https://docs.knock.app/integrations/in-app/knock)). |
| Row click | `markAsRead` or `markAsInteracted` (both set `read_at`) |
| "Mark all read" | batch `markAsRead` |

Cadence never sends `seen` or `archived`. Archived items are excluded from the feed by default (`archived: "exclude"`, feed.ts). There is no mark-unread, so `markAsUnread` goes unused.

## 3. Preferences

### The model

A PreferenceSet has `workflows`, `categories`, `channel_types` and `channels`. A workflow entry can be a `boolean`, `{ channel_types }`, `{ channels }` or `{ conditions }`. Channel types include `email` and `in_app_feed` (see [preferences/interfaces.ts](https://github.com/knocklabs/javascript/blob/main/packages/client/src/clients/preferences/interfaces.ts) and [types common.d.ts](https://github.com/knocklabs/javascript/blob/main/packages/types/src/common.d.ts)).

Evaluation rules ([Preferences overview](https://docs.knock.app/preferences/overview)):

- "Knock only sends a notification if all preference combinations that exist on the recipient evaluate to `true`." Unset values default to `true`.
- A category set to `false` blocks the send "even if a `channel_type` or `channel` on the workflow is explicitly set to `true`".
- A specific `channel` beats its `channel_type`. Cadence doesn't need this, so it shouldn't set `channels`.

### How Cadence's controls map to it

All three controls live in the user's `default` set:

| Cadence control | PreferenceSet key | Survives toggling? |
| --- | --- | --- |
| Per-item checkbox (Notification × Channel) | `workflows.<key>.channel_types.<email \| in_app_feed>` | It is the per-item choice itself. |
| Channel Mute switch | top-level `channel_types.email` / `channel_types.in_app_feed` = `false` | Yes. Any `false` blocks the send under the AND rule, and the per-workflow values underneath are untouched. Unmute by setting it back to `true`. |
| "Mute everything" | `categories.<all>` = `false`, where every non-locked workflow is tagged with one shared category (e.g. `cadence`) | Yes. "Category false wins" over everything else, and per-item and per-Channel values are untouched, so unmuting restores both. |

Caveat: the docs state the AND rule but give no worked example of top-level `channel_types: false` combined with workflow-level `channel_types: true`. That is inferred from the AND rule and should be checked once against a dev environment using the workflow run debugger ([debugging workflows](https://docs.knock.app/send-notifications/debugging-workflows)).

If Cadence would rather not depend on that, it can hold Mute and "Mute everything" in its own DB and write the flattened result to Knock. That costs a sync step. Native keys are simpler.

### Locked rows: correction

The brief says "Knock has no built-in mandatory flag". That isn't quite right. A workflow has an **"Override recipient preferences"** setting: "the workflow will send to all of its channels, regardless of the recipient's preferences" ([Preferences overview, Workflow overrides](https://docs.knock.app/preferences/overview)). It is set in the dashboard, under "Manage workflow" → commit.

It works **per workflow, not per channel step**. So:

- The purchase-receipt and Refund Request emails should be **email-only workflows** with the override on. If an in-app counterpart is wanted, it goes in a separate workflow that users can mute.
- Leave locked workflows out of the "Mute everything" category. The override would ignore the category anyway, but leaving them out keeps the data honest.
- Cadence still owns the UI side: which rows are locked, the lock icon and "Always sent", and refusing writes for those rows. Knock only guarantees delivery.

If those workflows must also carry a mutable in-app step, the fallback is Cadence-side logic: trigger with no preference override and enforce the rule in Cadence. That is weaker, because with a public key a user can `PUT` their own preferences directly ([security docs](https://docs.knock.app/in-app-ui/security-and-authentication)). The override flag is the safer enforcement.

### Prebuilt preferences UI: doesn't fit

- **Hosted preference center:** rows are categories or workflows, with per-channel-type toggles inside each row. "top-level channel type preferences aren't supported". It only shows a mandatory row for *commercial* messages, and it lives off-site on `p.knock.app` behind a signed URL ([Hosted preference center](https://docs.knock.app/preferences/hosted-preference-center)). It can't produce channel-first cards, Channel Mute or locked rows.
- **`@knocklabs/react`** ships no preference component. Only `usePreferences` exists in react-core, a thin SWR wrapper over `getPreferences` and `setPreferences` ([usePreferences.ts](https://github.com/knocklabs/javascript/blob/main/packages/react-core/src/modules/preferences/hooks/usePreferences.ts)). The only UI is an example in the repo (`examples/nextjs-example/components/NotificationPreferences.tsx`). Knock's docs point to a custom preference center for this case ([Custom preference center](https://docs.knock.app/preferences/custom-preference-center)).

Build the preference cards in Cadence. Read the set with `client.users.getPreferences(userId, "default")` in the `/settings` loader and write it with `client.users.setPreferences(userId, "default", …)` in an action ([knock-node api.md](https://github.com/knocklabs/knock-node/blob/main/api.md)). Cadence's catalogue decides which rows each role sees.

## 4. Auth and user ids

- **Server-side approach (recommended):** the browser needs no Knock credentials. The server uses the secret key (`KNOCK_API_KEY`) with `@knocklabs/node`, and the loader returns plain feed and preference data.
- **If any client-side Knock SDK is ever used:** the public API key goes to `KnockProvider apiKey` or `new Knock(publicKey)`, and the client calls `authenticate({ id }, userToken)`. In production, turn on **enhanced security mode**. Otherwise "a request using the public key can act as any user". With it on, Knock rejects client requests that don't carry a signed user token.
  - The token is an RS256 JWT with `sub` = user id (required), `iat`/`exp` and optional `grants`. Sign it server-side with `signUserToken(userId, { expiresInSeconds })` from `@knocklabs/node`, using `KNOCK_SIGNING_KEY`.
  - Refresh it via `onUserTokenExpiring`.
  - A root or layout loader would return `{ knockPublicKey, knockUserId, knockUserToken, feedChannelId }`.
  - Sources: [Security and authentication](https://docs.knock.app/in-app-ui/security-and-authentication), [knock-node README: JWT signing](https://github.com/knocklabs/knock-node#jwt-token-signing).
- **User ids:** Knock ids are strings, and Cadence's `users.id` is an integer (`app/lib/session.ts` stores `userId: number`). Use `String(user.id)` consistently, and use the same id for `sub`, triggers and preferences. Identify users (`client.users.update` / identify) with their `email` and `name` so the Postmark email step has an address. Dev-switcher users (`app/components/dev-ui.tsx`) map the same way.

## 5. Credential-free local dev and tests

This suggests a seam: a Cadence-owned **`NotificationService`** interface on the server (e.g. `app/lib/notifications/`), with two implementations:

- **`KnockNotificationService`** (production): wraps `@knocklabs/node`.
- **`LocalNotificationService`** (dev and test): an in-memory or SQLite store (Drizzle, per ADR 0005) that applies the same evaluation rules (AND rule, category wins, locked bypass) and fills in feed items directly when Cadence "triggers".

Interface sketch, in Cadence vocabulary rather than Knock's:

- `listFeed(userId) → { items: FeedRow[], unreadCount }`, where `FeedRow = { id, type, title, body, url, createdAt, read }`
- `markRead(userId, ids)`, `markAllRead(userId)`
- `getPreferences(userId) → { channelMute: {email, inApp}, muteAll, items: {[type]: {email, inApp}} }`
- `setPreferences(userId, patch)`
- `notify(userId, type, data)`: the trigger

Because the bell, popover and preference cards are fed by loaders, they only ever see these Cadence types. Component tests render them with fixture data, and route and loader tests use `LocalNotificationService`. Neither needs Knock credentials or network access. The mapping from Knock data to Cadence types (blocks, `source.key`, PreferenceSet keys) lives in one adapter, which can be unit-tested against recorded Knock JSON.

A client-side SDK would undercut this seam: `@knocklabs/client` and `@knocklabs/react` need a real API key and a reachable Knock API, and there is no offline mode in the source.

---

## Recommendation

| Piece | Choice |
| --- | --- |
| Bell and unread badge | **Headless, Cadence-built.** The sidebar header reads `unreadCount` from the layout loader. Copy the `9+` and hide-at-zero rules from Knock's `formatBadgeCount` and `UnseenBadge`. |
| Popover feed | **Headless, Cadence-built** with radix Popover and Tailwind. Data comes from the server-side `listFeed`. Mutations go through fetcher actions. There's no socket because no Knock SDK runs in the browser. |
| Preferences in `/settings` | **Headless, Cadence-built** cards. Native PreferenceSet keys hold the per-item checkboxes (`workflows.*.channel_types`), Channel Mute (top-level `channel_types`) and "Mute everything" (a shared category). Locked rows are email-only workflows with Knock's "Override recipient preferences" turned on, and Cadence renders and guards the lock. |
| Prebuilt `@knocklabs/react` and the hosted preference center | **Don't use them.** Every visible part needs overriding, and the real-time socket can't be turned off through the providers. The hosted center can't do channel-first layout, Mute or locks. |

## Build list

| Cadence builds | Knock data it needs |
| --- | --- |
| `NotificationService` interface, plus `KnockNotificationService` and `LocalNotificationService` | Secret API key and in-app feed channel id (production only) |
| Knock→Cadence adapter (feed rows, preference shape) | Feed `entries[]`: `id`, `source.key`, `data.title`, `blocks` (`body`, `action_url`), `inserted_at`, `read_at`; `meta.unread_count`; the PreferenceSet `default` |
| Bell with badge in the sidebar header | `meta.unread_count` |
| Popover feed (list, row, header with "Mark all read" and gear, empty state) | Feed rows as above. `messages.markAsRead` (row) and `messages.batch.markAsRead` (all). |
| Notification catalogue: 10 types → icon, label, roles, Channels, locked flag, Knock workflow key | Workflow keys (one per Notification). Locked ones are email-only with "Override recipient preferences" on. A shared category on all non-locked workflows. |
| Preference cards (Email, In-app), Channel Mute switch, "Mute everything", locked rows | `users.getPreferences` and `users.setPreferences` on `default`: `workflows.<key>.channel_types.{email,in_app_feed}`, `channel_types.{email,in_app_feed}`, `categories.<all>` |
| Trigger and identify calls when Cadence events happen | `workflows.trigger` with flat `data` (`title`, URL params). `users.update` with `email` and `name`. Recipient id = `String(user.id)`. |
| Knock dashboard setup | In-app feed channel, Postmark email channel, 10 workflows with in-app templates (markdown body and action URL) and email templates |
| One-off check in Knock dev | That top-level `channel_types.email: false` blocks a workflow whose `channel_types.email` is `true`, and that `categories.<all>: false` blocks all non-locked workflows (workflow run debugger) |
