# What does Browser notification support take in Cadence?

Research for [#7](https://github.com/brickart/cohort-005-project-fork/issues/7), part of the map [#5](https://github.com/brickart/cohort-005-project-fork/issues/5). This note gathers facts only. Whether Browser ships in v1 is decided in [#10](https://github.com/brickart/cohort-005-project-fork/issues/10).

Researched 2026-11-10. Repo state: React Router `8.3.0` (framework mode, `ssr: true`), Vite 7, served in production by `react-router-serve`.

## TL;DR

- **Technically small, operationally real.** A Browser Notification needs four things. First, a service worker file served from the origin root (`public/sw.js` is enough in this repo). Second, one VAPID key pair. Third, a table of `PushSubscription`s, one per user per browser. Fourth, a server-side sender: the `web-push` npm library, or a Notification service. HTTPS is required, but `http://localhost` counts as secure, so local dev works.
- **Support:** Chrome, Edge and Firefox on desktop and Android support it. Safari on macOS 13+ supports it in ordinary tabs. **iOS/iPadOS 16.4+ supports it only for sites added to the Home Screen**, and that needs a web app manifest. Cadence has no manifest today.
- **Prompting:** Browsers punish asking on page load. Firefox 72+ requires a user gesture. Chrome has quieter prompts, auto-revokes permission from low-engagement sites, and since January 2026 rate-limits push. Ask from a button, at a moment that makes the benefit obvious (for example a "Notify me in this browser" toggle on the Notification Preferences page).
- **Testing:** Real push delivery can't run in CI without network access to the browser vendors' push services. The credential-free path is to put sending behind a transport interface, like `mailer.server.ts` with `.outbox/`, and assert on what would have been sent. Use Chrome DevTools "Push" and `localhost` for manual checks.
- **Services:** Coverage is uneven. **MagicBell** and **OneSignal** speak standard VAPID Web Push natively. **Knock** has no first-party web push channel and routes through FCM (or OneSignal). **Novu** routes through FCM, OneSignal, Pushpad, or a Push Webhook you deliver yourself. **Courier**'s documented browser routes are third-party providers (OneSignal, NowPush). Every option still needs a service worker on Cadence's origin.

## 1. Platform requirements

### Service worker + Push API + Notifications API

- To receive push, the page needs an **active service worker**. It subscribes via `PushManager.subscribe()` and gets a `PushSubscription` with an endpoint and encryption keys. Messages arrive at the worker's `push` event, and the worker shows them with `registration.showNotification()`. <https://developer.mozilla.org/en-US/docs/Web/API/Push_API>
- The subscription **endpoint is a capability URL**: anyone who has it can send to that browser, so keep it secret. MDN also warns to protect the subscribe flow against CSRF. <https://developer.mozilla.org/en-US/docs/Web/API/Push_API>
- `userVisibleOnly: true` is required in practice. Chrome and Edge reject the subscription without it, and every push must show a notification. <https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe>, <https://web.dev/articles/push-notifications-subscribing-a-user>
- Permission is requested with `Notification.requestPermission()`, which resolves to `granted`, `denied` or `default`. MDN: it "should only be called when handling a user gesture". <https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API>, <https://web.dev/articles/push-notifications-subscribing-a-user>
- Use **persistent notifications** (`showNotification` from the service worker) and handle clicks in `notificationclick`. `new Notification()` "will throw a `TypeError` on most mobile browsers". <https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API>
- Handle `pushsubscriptionchange`, which fires when a subscription is invalidated or about to expire. <https://developer.mozilla.org/en-US/docs/Web/API/Push_API>

### VAPID keys

- `applicationServerKey` is "an ECDSA P-256 public key that the push server will use to authenticate your application server… all messages from your application server must use the VAPID authentication scheme". Chrome and Edge require it. <https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe>, BCD notes in <https://github.com/mdn/browser-compat-data/blob/main/api/PushManager.json>
- Generate the keys **once** and keep the private key secret. Use `web-push generate-vapid-keys` or `webpush.generateVAPIDKeys()`, then `setVapidDetails(subject, publicKey, privateKey)`. The subject should be a real `mailto:`/`https:` contact. Apple may reject a localhost subject with `403 BadJwtToken`. <https://github.com/web-push-libs/web-push>, <https://web.dev/articles/push-notifications-subscribing-a-user>
- No Apple Developer account and no certificates are needed for Safari: "You don't need to join the Apple Developer Program to send Web Push notifications." <https://webkit.org/blog/12945/meet-web-push/>
- Push service responses: `201` accepted; `404` expired and `410` gone (both mean **delete the stored subscription**); `413` payload too large; `429` rate-limited. A `TTL` header is required, and `Urgency` is optional. <https://web.dev/articles/push-notifications-web-push-protocol>

### HTTPS / localhost

- `PushManager.subscribe` and the Notifications API are secure-context only. <https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe>
- `localhost`, `*.localhost`, `127.0.0.0/8` and `::1` are "potentially trustworthy", so `http://localhost:5173` is a secure context. Other dev hostnames (for example a LAN IP or `cadence.local`) are not. <https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts>
- OneSignal adds that web push doesn't work in incognito/private windows. <https://documentation.onesignal.com/docs/web-push-quickstart>

## 2. Browser support (MDN BCD, `PushManager.subscribe`)

Source: <https://github.com/mdn/browser-compat-data/blob/main/api/PushManager.json>. Baseline "Widely available" since March 2023: <https://developer.mozilla.org/en-US/docs/Web/API/PushManager>

| Browser | Since | Note |
| --- | --- | --- |
| Chrome / Chrome Android / Samsung Internet | 42 | `applicationServerKey` required |
| Edge | 17 | `applicationServerKey` required |
| Firefox | 44 | 72+: only in response to a user gesture |
| Firefox Android | 48 | 79+: only in response to a user gesture |
| Safari (macOS) | 16 | "Notifications are supported on macOS Ventura and later." |
| Safari iOS / iPadOS | 16.4 | "Notifications are supported in web apps saved to the home screen." |

### Safari specifics

- **macOS:** Safari 16 on macOS 13 Ventura+ works in normal tabs. It uses the standard APIs, and "requesting a push subscription requires an explicit user gesture". <https://webkit.org/blog/12945/meet-web-push/>
- **iOS/iPadOS: yes, Home Screen only.** "A web app that has been added to the Home Screen can request permission to receive push notifications." It needs a web app manifest with `display` set to `standalone` or `fullscreen`, and the permission request must come "in response to direct user interaction". Delivery goes via APNs, so a server that restricts outbound hosts must allow `*.push.apple.com`. <https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/>
- From iOS 26, "every website added to the Home Screen opens as a web app" by default. This makes the Home Screen route a bit easier, but the user still has to add the site. <https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/>
- **Declarative Web Push:** iOS/iPadOS 18.4 (Home Screen apps) and Safari 18.5 on macOS add this. A JSON payload with a `web_push` key and a `notification` dict (including a required `navigate` URL) is shown by the browser itself, with no service worker JS needed. Older browsers fall back to the service worker. <https://webkit.org/blog/16535/meet-declarative-web-push/>, <https://webkit.org/blog/16574/webkit-features-in-safari-18-4/>, <https://webkit.org/blog/16923/webkit-features-in-safari-18-5/>
- **Implication for Cadence:** iPhone Learners get nothing unless Cadence ships a manifest and they install it to the Home Screen. Cadence has no `manifest.webmanifest` today (`public/` holds only `favicon.svg` and `images/`).

## 3. Serving and registering a service worker in this repo

What the repo does today:

- `vite.config.ts` has only `tailwindcss()`, `reactRouter()` and `tsconfigPaths()`. There is no PWA plugin.
- `react-router.config.ts` sets `ssr: true`.
- There is no `app/entry.client.tsx` (React Router's default is in use).
- Nothing references a service worker or manifest.

How a worker would be served:

- **Put it in `public/sw.js`.** Vite serves `public/` "at root path `/` during dev, and copied to the root of the dist directory as-is", without hashed names. <https://vite.dev/guide/assets>
- In production, `react-router-serve` (`node_modules/@react-router/serve/dist/cli.js`) serves `build/client/assets` as `immutable, maxAge 1y`. Every other file in `build/client`, which includes copied `public/` files such as `/sw.js`, goes through plain `express.static`. So `/sw.js` is not long-cached, which is what a service worker needs. The Express layer is documented at <https://reactrouter.com/api/other-api/serve>.
- **Scope:** "The default scope… is the directory where the service worker script is located". A worker can't control a broader scope without a `Service-Worker-Allowed` header. A worker at `/sw.js` therefore controls the whole app with no extra config. `type: 'module'` is available if we want ES imports in the worker. <https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register>
- **Registering:** call `navigator.serviceWorker.register('/sw.js')` in client-only code. One option is a `useEffect` in `app/root.tsx` or in the preferences UI. The other is the client entry: React Router describes `entry.client.tsx` as "the first piece of code that runs in the browser. You can initialize any other client-side code here", and `npx react-router reveal` generates it. <https://reactrouter.com/api/framework-conventions/entry.client.tsx>
- **Keep it push-only.** A push-only worker needs `push` and `notificationclick` handlers and no `fetch` handler, which keeps React Router's SSR and asset handling untouched. Community reports of Workbox precaching in RR7 framework mode hit versioned-asset and `/__manifest` issues. Those are unofficial and worth knowing only if offline caching is ever in scope: <https://github.com/remix-run/react-router/discussions/14588>, <https://github.com/remix-run/react-router/discussions/12620>
- **Writing it in TypeScript** would need a separate build step or Vite entry, since `public/` is copied verbatim. A small plain-JS worker avoids that.
- **Server side:** a Drizzle table for subscriptions (user id, endpoint, `p256dh`, `auth`, created at). Add a resource route action to save and delete subscriptions; per MDN's CSRF warning, it should be a same-origin POST tied to the session user. Add a sender that deletes rows on 404/410. Self-hosting means `web-push` as a new dependency, plus `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` env vars.

## 4. Permission-prompt practice

- **Don't ask on load.** "The worst thing you can do is to show the permission dialog to users as soon as they land on your site." Ask when the benefit is obvious, or from a settings toggle. For a central feature, use the **double-permission** pattern: an in-app explainer first, then the real prompt only after the user says yes. Once a user **blocks**, "your web app can't ask for permission again". Explain how to turn push off. <https://web.dev/articles/push-notifications-permissions-ux>
- **Firefox 72+:** prompts without user interaction are suppressed to a URL-bar icon. <https://blog.mozilla.org/futurereleases/2019/11/04/restricting-notification-permission-prompts-in-firefox/>, BCD note above.
- **Chrome:**
  - Quieter permission UI (Chrome 80) for sites with low acceptance rates. <https://blog.chromium.org/2020/01/introducing-quieter-permission-ui-for.html>
  - Permission chip since Chrome 98; non-gesture requests don't intrude. Chrome's own data: about 85% of notification prompts are ignored or dismissed. <https://developer.chrome.com/blog/permissions-chip>
  - Auto-revocation of notification permission on sites with "very low user engagement and a high volume of notifications" (October 2025). It "does not revoke notifications for any installed web apps." <https://blog.google/chromium/automatic-notification-permission/>
  - Push rate limits from January 2026 for sites with many pushes and prompts but little engagement. Limited sites get HTTP 429 above 1,000 messages a minute, with escalating 1/7/14-day penalties. "Nearly all websites will be unaffected." <https://developer.chrome.com/blog/web-push-rate-limits>
- **Safari** requires a user gesture on both macOS and iOS (sources in section 2).
- **Fit for Cadence:** a per-browser "Enable Browser notifications" toggle on the Notification Preferences page meets every rule above. Pushes should be low volume and tied to real events (for example Refund Request decisions), which keeps Cadence clear of Chrome's penalties. Note that permission and subscription belong to one *browser*, not the user. A Learner with three devices has three subscriptions, and the preference UI needs to reflect "this browser".

## 5. Testing locally and in CI

- **Local manual testing:** `npm run dev` on `localhost` is a secure context, so the full flow works in Chrome, Firefox and Safari without HTTPS. Chrome DevTools > Application > Service workers has a **Push** button that "emulates a push notification without a payload", plus "Update on reload" to pick up worker edits. <https://developer.chrome.com/docs/devtools/progressive-web-apps>
- **Real sends need the network, not credentials.** Self-hosted VAPID means Cadence's server POSTs to the browser vendor's endpoint (FCM, Mozilla autopush, APNs). No account is needed, only the self-generated key pair. Keys can be generated per dev machine or committed as dev-only keys. A vendor service adds an API key, which breaks the standing rule unless it is behind a fallback.
- **Matching the standing rule** ("local dev and tests work with no service credentials"): mirror `app/lib/mailer.server.ts`. A `PushTransport` interface would have a real implementation (`web-push` or the vendor's API) used when keys are set, and an outbox implementation that writes JSON to a folder when they aren't. Vitest tests then assert on the outbox or a fake transport. They also cover subscription storage and 404/410 cleanup by faking the sender's response. Vitest can't exercise a real service worker or push service.
- **Browser E2E (optional, not in repo today):** Playwright can `grantPermissions(['notifications'])`, but "supported permissions differ between browsers". It can test the subscribe UI and that `/sw.js` registers. It can't reliably receive a real push in headless CI. <https://playwright.dev/docs/api/class-browsercontext#browser-context-grant-permissions>
- **DevUI observability:** a Browser Notification can't be "seen" by switching users in the DevUI panel, because OS notifications belong to the browser, not the session. The likely answer is that each Browser delivery is also recorded where the In-app feed or outbox can show it. That is a design point for #10, not settled here.

## 6. Notification services vs rolling our own

| Service | Browser (Web Push) support | Notes |
| --- | --- | --- |
| **Knock** | "Knock does not have a first-party web push channel." Route via **FCM** (Firebase web SDK, `firebase-messaging-sw.js` in `public/`, VAPID key from the Firebase console, token stored with `setChannelData`) or OneSignal. | Adds a Firebase project. <https://docs.knock.app/tutorials/sending-web-push-notifications-with-fcm>, <https://docs.knock.app/integrations/push/overview> |
| **Novu** | Push providers: FCM, Expo, APNs, OneSignal, Pusher Beams, Pushpad, **Push Webhook**. No native VAPID channel documented. The Push Webhook POSTs a signed payload to an endpoint *you* run, so you'd still do the Web Push send yourself. | <https://docs.novu.co/platform/integrations/push>, <https://docs.novu.co/platform/integrations/push/push-webhook> |
| **Courier** | Its FCM doc covers Android/iOS only. Documented browser routes are third-party providers: OneSignal, or NowPush with `device_type: "browser"`. Its "Courier Push"/Inbox uses a WebSocket and works only while the tab is open. | <https://www.courier.com/docs/external-integrations/push/firebase-fcm>, <https://www.courier.com/docs/external-integrations/push/onesignal>, <https://courier.com/docs/external-integrations/push/nowpush>, <https://www.courier.com/guides/how-to-build-a-notification-center/chapter-2-how-to-build-a-notification-center> |
| **MagicBell** | **Native Web Push channel.** You supply your own VAPID key pair. Subscriptions (`endpoint`, `p256dh`, `auth`) are stored as channel tokens. The client has a `WebPushButton`, and your `sw.js` imports MagicBell's script. | <https://www.magicbell.com/docs/channels/web_push>, <https://www.magicbell.com/docs/libraries/magicbell-react>, <https://www.magicbell.com/docs/libraries/magicbell-webcomponents> |
| **OneSignal** | **Native web push**, and its own product. `OneSignalSDKWorker.js` goes at the site root, served from your origin. It handles VAPID for Safari 16+/iOS 16.4+, and iOS still needs a manifest plus Home Screen install. Needs a **separate OneSignal app for localhost** plus `allowLocalhostAsSecureOrigin`. Also used as the browser route by Knock, Novu and Courier. | <https://documentation.onesignal.com/docs/web-push-quickstart> |
| **Roll our own** | `web-push` + a VAPID key pair + a subscriptions table + `public/sw.js`. No vendor account; needs only self-generated keys, though sends still reach the browser vendors' push services. | <https://github.com/web-push-libs/web-push> |

What no service removes:

- The service worker file on Cadence's origin.
- The permission UX.
- The iOS manifest and Home Screen requirement.
- Per-browser subscription management in the UI.

What a service adds:

- Routing and Notification Preference enforcement in one place, alongside Email and In-app.
- Delivery logs.
- Token cleanup.

For Knock, Novu and Courier, Browser also brings a **second vendor** (FCM or OneSignal) with its own credentials and dashboard. How much this matters depends on which service #5 picks.

## Open points handed to #10

- Is iOS reach without a manifest and Home Screen install acceptable, or does v1 need a manifest too?
- If the chosen service lacks native Web Push, does Browser go through a second vendor or a self-hosted `web-push` sender?
- Where does the permission prompt live? (Section 4 suggests the Notification Preferences page.)
- How are Browser deliveries made observable in the DevUI with no credentials? (Section 5.)
