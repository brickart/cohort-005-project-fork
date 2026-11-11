# Which Email provider sits behind Knock?

Research note for the ticket "Which Email provider sits behind Knock?" (#14). Researched 2026-11-11 against Knock's docs and pricing page, and the docs and pricing pages of Postmark, Resend, Amazon SES, Mailgun and Twilio SendGrid.

**Short answer:** keep Postmark. Knock supports Postmark as a first-class email provider, and no Knock plan gates email providers or channels: the Free plan has unlimited delivery channels. A plan change would not fix the failed connection. The cause is almost certainly on the Postmark side (an unapproved account, a From address with no confirmed Sender Signature, or the wrong token) or in how the Knock workflow is wired (the email step still points at the Knock test channel, or the change was never committed). Run the checklist in section 1. Switch to Resend only if the Postmark account itself can't be used. At Cadence's volume, Knock Free plus Postmark Basic ($15/month) or Resend Free ($0) both fit.

---

## 1. Why Postmark might fail to connect

### What Knock needs from Postmark

From [Knock's Postmark page](https://docs.knock.app/integrations/email/postmark):

- **API key**: the Postmark **server** API token ("The API key for your Postmark server"). It's the same kind of token Cadence already sends as `X-Postmark-Server-Token` in `app/lib/mailer.server.ts`. The page doesn't mention account tokens.
- **From email address**: required. Liquid is allowed.
- **Prerequisite**: a verified Sender Signature or domain in Postmark.
- **Message stream**: Knock doesn't set one, so Postmark uses the default transactional stream, `outbound`. Cadence also sends on `outbound` today.
- **Incoming webhook**: optional. It's only for delivery, bounce and spam-complaint status.
- All settings are entered **per environment**.

Postmark's side:

- Postmark has two token types. `X-Postmark-Server-Token` is for server-level requests (sending). `X-Postmark-Account-Token` is for account-level requests. Using the wrong one returns error **10** (HTTP 401): "Request does not contain a valid Server or Account token, or the wrong token type was used for the endpoint." ([API overview](https://postmarkapp.com/developer/api/overview))
- "Postmark only allows you to send from email addresses that you've confirmed beforehand." Free mailbox domains (Gmail, Yahoo) can't be Sender Signatures. ([Managing sender signatures](https://postmarkapp.com/developer/user-guide/managing-your-account/managing-sender-signatures))
- New accounts are **pending approval** until an Account Owner requests a review. Until then "you won't be able to send to any email address outside the domains you've added to your account and verified". Approval takes under 24 hours on weekdays. ([Account approval](https://postmarkapp.com/support/article/1084-how-does-the-account-approval-process-work)) The send-time errors are **412**: "While your account is pending approval, all recipient addresses must share the same domain as the From address." and **413**: "This account is not approved to send email." ([API overview](https://postmarkapp.com/developer/api/overview))
- The free Developer plan allows **100 emails/month, with no overages**. ([Pricing](https://postmarkapp.com/pricing))

Knock's side:

- **Only Owner and Admin roles can manage channels.** Member, Production-only member and Support can only view them. ([Roles and permissions](https://docs.knock.app/manage-your-account/roles-and-permissions)) On an existing account where the user isn't an Admin, the "add channel" or save action won't be available.
- Channel config is **not versioned** and takes effect on save. Workflows **are** versioned: "To test changes through the API, you must commit them." ([Commits](https://docs.knock.app/concepts/commits))
- To move off the test channel you must "change the channel on each of your existing email steps to use the new provider", then publish the workflows, then commit and promote. ([Knock test email](https://docs.knock.app/integrations/email/knock-test))
- **No plan gate:** the [pricing page](https://knock.app/pricing) lists unlimited delivery channels on Free, Starter and Enterprise. The [email overview](https://docs.knock.app/integrations/email/overview) lists Postmark with no plan restriction.

### Plausible causes, most likely first

The exact failure is unknown, so this ranking is a judgement call.

1. **The Knock workflow's email step still uses the Knock test channel, or the switch wasn't committed.** API triggers run the last committed version. A Postmark channel can be configured correctly while the workflow keeps sending through "Knock (testing only)", which looks like "Postmark doesn't work" (and still produces `knock_recipient_not_allowed`).
2. **The Postmark account is pending approval.** Sends to anyone outside the verified domain fail with 412 (or 413). In the message logs this looks like a provider error, not a config error.
3. **The From address has no confirmed Sender Signature or verified domain** on the Postmark account behind the token. One example is setting `hello@cadence.dev` on a personal Postmark account that has never verified `cadence.dev`. **Unverified:** whether the user controls the `cadence.dev` domain at all. If it's only the course's fictional domain, no provider will send from it, and the From address has to move to a domain they own.
4. **Wrong token type.** An Account API token was pasted instead of a Server API token (error 10 / HTTP 401). The server token sits in the Postmark server's **API Tokens** tab. The account token sits under account settings.
5. **The free Developer plan's 100 emails/month are used up.** No overages are allowed, so sends stop until the month resets.
6. **Insufficient Knock role.** The user is a Member on the existing Knock account, so they can't create or save channels.
7. **The channel was configured in the wrong environment.** For example, settings were entered for Production while the trigger ran in Development. Each environment holds its own settings.
8. **The recipient has no `email` property in Knock**, or the address is inactive in Postmark after a hard bounce or spam complaint (error 406). This affects individual recipients, not the connection.

Not supported by any source: Knock doesn't say whether it validates the Postmark key when the channel is saved. If the dashboard refused to save, the cause is in the field values or the role (causes 4 and 6). If it saved but sends fail, look at causes 1, 2, 3 and 5.

### Checklist to pin it down

1. Knock → **Settings → Members**: confirm your role is Owner or Admin.
2. Knock → **Channels → your Postmark channel**: confirm the **Development** environment has an API key and From address filled in, not just Production.
3. Postmark → **Servers → (server) → API Tokens**: copy the **Server API token** and paste it again. To check the token itself outside Knock, run `curl -H "X-Postmark-Server-Token: <token>" https://api.postmarkapp.com/server`. A 200 means the server token is valid. An error 10 means it's the wrong kind of token or wrong value.
4. Postmark → **Sender Signatures**: confirm the exact Knock From address (or its whole domain) is listed and confirmed or verified.
5. Postmark account: look for a "pending approval" banner. If it's there, request approval as Account Owner. Meanwhile, test against `test@blackhole.postmarkapp.com` (Postmark's sink address) or a recipient on the From domain.
6. Postmark → **Billing**: confirm the plan. If it's the free Developer plan, check this month's count against the limit of 100.
7. Knock → **Workflows → each workflow → email step**: confirm the step's channel is the Postmark channel, not "Knock (testing only)". Then **commit** in Development.
8. Trigger once, then open Knock **Messages → Logs** for that message. The provider response body shows Postmark's `ErrorCode`: 10 = token, 412/413 = approval, 406 = inactive recipient, 300 = validation (for example, a missing address). This alone usually names the cause.
9. Postmark → **Activity** for the server: if the message appears, Knock connected and the problem is delivery. If it doesn't appear, the request was rejected (step 8).

---

## 2. Email providers Knock supports

[Knock's email overview](https://docs.knock.app/integrations/email/overview) lists these providers. D = delivery tracking, B = bounce support, L/O = provider link and open tracking.

| Provider | D | B | L/O |
| --- | --- | --- | --- |
| Knock (testing only) | yes | yes | yes |
| Amazon SES | yes | yes | |
| Cloudflare Email | | | |
| MailerSend | yes | yes | |
| Mailgun | yes | yes | yes |
| Mailjet | yes | | yes |
| Mailtrap | yes | | |
| Mandrill | yes | | yes |
| Postmark | yes | yes | yes |
| Resend | yes | yes | |
| SendGrid | yes | yes | yes |
| SMTP | | | |
| SparkPost | yes | | yes |

**Plan gating:** none found. The overview doesn't mention plans, and pricing lists unlimited delivery channels on every plan. The Knock test channel itself only delivers to account members' addresses, and is capped at 100 emails/month ([Knock test email](https://docs.knock.app/integrations/email/knock-test)).

### Cadence's volume (estimate)

The repo has no production data. The seeded `data.db` has 1 admin, 3 instructors and 40 students. Over a year (2025-11-21 to 2026-11-10) it has 61 purchases, 66 enrollments, 15 comments, 17 coupons and 2 refunds, which is only a handful of emails per month.

**Assumption for sizing:** a small live course platform at roughly 10 to 100 times the seed. For example, per month: 500 purchases, 500 enrollments, 100 lesson questions, 100 replies, 50 coupon redemptions, 20 Refund Requests (2 Admins), 10 course status changes. Mapped onto the ten-Notification catalogue (issue #8):

| Notification | Emails/month | In-app/month |
| --- | --- | --- |
| Purchase confirmed | 500 | 500 |
| Refund Request raised (confirmation) | 20 | 20 |
| Refund Request raised (to decide), ×2 Admins | 40 | 40 |
| Refund Request approved / declined | 20 | 20 |
| New question on a lesson | 100 | 100 |
| Reply to your comment | 100 | 100 |
| New Enrollment (in-app only) | 0 | 500 |
| Coupon redeemed | 50 | 50 |
| Course published / archived | 10 | 10 |
| **Total** | **≈840** | **≈1,340** |

That's about 1,000 emails/month (low thousands at most) and about 2,200 Knock messages/month. Knock bills every delivery on every channel: "a workflow that sends both an in-app message and an email counts as two messages sent" ([pricing FAQ](https://knock.app/pricing)). Mute and Preferences only lower these figures.

### Candidates

All of them need DNS records on the sending domain (`cadence.dev`, or whatever domain the user actually controls) and an API credential pasted into the Knock channel for **each** environment.

| Provider | Domain setup | Credential in Knock | Free tier | Paid cost at ~1k emails/month | Notes |
| --- | --- | --- | --- | --- | --- |
| **Postmark** | Sender Signature or verified domain. Domain verification is a DKIM TXT record plus a Return-Path CNAME (`pm_bounces` → `pm.mtasv.net`). DMARC: start with `p=none`. ([verify a domain](https://postmarkapp.com/support/article/1046-how-do-i-verify-a-domain)) | Server API token, From address ([Knock](https://docs.knock.app/integrations/email/postmark)) | 100/month, no overages | **$15/month** Basic for 10,000. No tier between 100 and 10,000. ([pricing](https://postmarkapp.com/pricing)) | Already used by Cadence. Needs an approved account. Full D/B/L/O tracking in Knock. |
| **Resend** | Must "add and verify at least one domain". DKIM and SPF via TXT and MX/CNAME. The Return-Path defaults to `send.<domain>`. DMARC after verification. ([add a domain](https://resend.com/docs/add-a-domain.md)) | API key, From address ([Knock](https://docs.knock.app/integrations/email/resend)) | **3,000/month, 100/day**, 3 domains | $0 at this volume. Pro is $20/month for 50,000. ([pricing](https://resend.com/pricing)) | The 100/day cap could be hit on a busy launch day. An unverified domain gives "Identity not found" in Knock. |
| **Amazon SES** | Verify the domain identity. New accounts start in a per-region **sandbox**: only verified recipients, 200/day, 1/sec. Production access is reviewed within about 96 hours. ([SES sandbox](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)) | Region, Access key ID and secret (or Role ARN + External ID), From address. The IAM user needs `ses:SendEmail` and `ses:SendRawEmail`. Delivery tracking needs SNS. ([Knock](https://docs.knock.app/integrations/email/aws-ses)) | Paid from AWS Free Tier credits (up to $200, 6-month free plan) | **≈$0.10** ($0.10 per 1,000) ([pricing](https://aws.amazon.com/ses/pricing/)) | Cheapest, but the most setup: AWS account, IAM, sandbox exit, SNS webhooks. |
| **Mailgun** | One custom sending domain on Free and Basic | API key, domain, From address ([Knock](https://docs.knock.app/integrations/email/mailgun)) | 100/day | $15/month Basic for 10,000 ([pricing](https://www.mailgun.com/pricing/)) | Same price as Postmark, with no advantage here. |
| **SendGrid** | Domain authentication | API key, From address | **Trial only:** 100/day for 60 days | From $19.95/month Essentials (50,000 to 100,000) ([pricing](https://www.twilio.com/en-us/products/email-api/pricing.md)) | No permanent free plan. The most expensive option for this volume. |

I didn't open Knock's Mailgun and SendGrid pages field by field, so their "Credential" cells are the usual fields for those providers. Check them on the Knock page before setting either one up.

---

## 3. Keep Postmark or switch?

**No Knock plan change is involved either way.** Knock's plans ([pricing](https://knock.app/pricing)):

| | Free | Starter | Enterprise |
| --- | --- | --- | --- |
| Price | $0 | $250/month | Custom |
| Messages included | 10,000 | 50,000, then $0.005 each | Volume-based |
| Delivery channels | Unlimited | Unlimited | Unlimited |
| Environments | Unlimited | Unlimited | Unlimited |
| Remove Knock branding | No | Yes | Yes |
| Log retention | 30 days | 30 days | 90 days |

Knock doesn't bill downstream providers, so Postmark or Resend charges come separately. Free has no hard cap: Knock contacts you about billing if you go over. At about 2,200 messages/month Cadence uses about a fifth of the Free allowance. Starter becomes relevant at about 10,000 messages (about 4,000 to 5,000 emails plus the in-app copies), or if "Powered by Knock" branding matters. The branding only shows in Knock's prebuilt feed components, which `knock-ui-fit.md` recommends against using.

**Recommendation: keep Postmark for Production.**

- It's what Cadence sends through today: the same server token, `outbound` stream and From address. Moving to Knock doesn't need a new vendor, new DNS records or a new deliverability reputation.
- Knock's Postmark integration supports delivery, bounce and open/link tracking.
- Cost at the assumed volume is $15/month (Basic). That beats SendGrid, matches Mailgun, and costs $15 more than Resend Free.
- It requires an **approved** Postmark account with a confirmed signature for the From domain. If Cadence's production Postmark account already sends `hello@cadence.dev` today, those requirements are already met.

**Switch to Resend if:**

- the working Postmark account can't be used (for example, it belongs to someone else, or approval is refused), or
- you want $0 while volume stays under 3,000/month and 100/day.

It still needs the same domain verification, and the 100/day cap is a real risk on busy days.

**Don't pick SES** unless cost at much higher volume starts to matter. The sandbox exit and SNS wiring are disproportionate work at this scale.

---

## 4. Per-environment channel config

- A channel "exists across all environments in your Knock account and uses the same ID", but its settings are entered **separately for each environment**. Settings can be cloned between environments. ([Channels](https://docs.knock.app/concepts/channels))
- Channel settings are **not version-controlled**. They take effect on save and are **not** carried over by commit or promote. ([Commits](https://docs.knock.app/concepts/commits)) Workflows that reference the channel *are* promoted, so after promotion the Production email step points at the same channel ID. **If Production has no settings for that channel, Production email won't send.**
- Practical setup:
  - **Development**: either a separate Postmark server and its own server token (keeps dev traffic and webhooks apart from production), or sends only to team addresses, or to Postmark's sink address `test@blackhole.postmarkapp.com`.
  - **Production**: the production server token and the `hello@cadence.dev` From address.
  - Each environment has its own incoming-webhook URL, which has to be added to the matching Postmark message stream.
- Not verified: whether extra Postmark servers cost anything. The pricing page didn't say.

## Not verified from a primary source

- The exact error the user hit when connecting Postmark. The ranking in section 1 is inferred.
- Whether the user owns or controls `cadence.dev`. This decides whether *any* provider can send as `hello@cadence.dev`.
- Whether the Knock dashboard tests the Postmark key when you save.
- Cadence's real production volume. The seed data is synthetic, and the sizing above is an assumption.
- Mailgun and SendGrid Knock field lists, and SendGrid overage rates.
