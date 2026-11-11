// ─── PROTOTYPE: "Does Knock work end-to-end in Cadence?" ───
// Throwaway. Lives on the prototype/knock-end-to-end branch only.
//
// One Cadence-owned seam, NotificationService, with two transports:
//   - knock: real Knock (Development env) when KNOCK_API_SECRET_KEY is set
//            and we are not under vitest. Run with `npm run dev:knock`.
//   - local: credential-free. Feed rows go to .notifications-prototype.json
//            (PROTOTYPE, wipe me); Email goes through the existing mailer,
//            so it lands in .outbox/.

import Knock from "@knocklabs/node";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { sendEmail } from "~/lib/mailer.server";
import { formatPrice } from "~/lib/utils";

// ─── Catalogue (one entry, for the prototype) ───
// One catalogue Notification = ONE Knock workflow with an Email step and an
// In-app step. Email is sent by Knock (Postmark as its provider), not by
// Cadence. `locked: true` means the workflow has "Override recipient
// preferences" on, which locks BOTH steps (Knock overrides per workflow).

type RefundRequestRaisedData = {
  learnerName: string;
  courseTitle: string;
  courseSlug: string;
  amount: number;
};

export const catalogue = {
  "refund-request-raised": {
    label: "Refund Request raised",
    workflow: "refund-request-raised",
    locked: true,
    title: (d: RefundRequestRaisedData) => `Refund requested — ${d.courseTitle}`,
    url: (d: RefundRequestRaisedData) => `/courses/${d.courseSlug}`,
    // Used by the local transport only. In Knock this text lives in the
    // workflow's email template (Liquid), in the dashboard.
    localEmailBody: (d: RefundRequestRaisedData) =>
      [
        `Hi ${d.learnerName},`,
        "",
        `We have your refund request for "${d.courseTitle}".`,
        `The refund is for ${formatPrice(d.amount)}, the amount you paid.`,
        "",
        "Our team reviews every refund request by hand. You do not need to do anything else — we will email you again when it is done.",
        "",
        "— The Cadence team",
      ].join("\n"),
    localInAppBody: (d: RefundRequestRaisedData) =>
      `We have your refund request for **${d.courseTitle}** (${formatPrice(d.amount)}).`,
  },
} as const;

export type NotificationType = keyof typeof catalogue;

export type Recipient = { id: number; name: string; email: string };

export type FeedRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  url: string | null;
  createdAt: string;
  read: boolean;
};

export interface NotificationService {
  readonly kind: "knock" | "local";
  notify(
    type: NotificationType,
    recipient: Recipient,
    data: RefundRequestRaisedData
  ): Promise<void>;
  listFeed(userId: number): Promise<{ items: FeedRow[]; unreadCount: number }>;
  markRead(userId: number, ids: string[]): Promise<void>;
}

// ─── Knock ───

function knockService(apiKey: string, feedChannelId: string): NotificationService {
  const client = new Knock({ apiKey });

  return {
    kind: "knock",
    async notify(type, recipient, data) {
      const entry = catalogue[type];
      // Inline identify: Knock upserts the user with email + name, so the
      // Postmark step has an address. No separate identify call.
      // PROTOTYPE: Knock's built-in email channel only delivers to members of
      // the Knock account, so seeded .dev addresses are rejected. Redirect to
      // KNOCK_PROTOTYPE_EMAIL_TO (set in .env) to prove the path.
      const email = process.env.KNOCK_PROTOTYPE_EMAIL_TO || recipient.email;
      const recipients = [
        { id: String(recipient.id), name: recipient.name, email },
      ];
      const triggerData = {
        ...data,
        amountFormatted: formatPrice(data.amount),
        title: entry.title(data),
        url: entry.url(data),
      };
      await client.workflows.trigger(entry.workflow, {
        recipients,
        data: triggerData,
      });
    },
    async listFeed(userId) {
      // FINDING: client.users.feeds.listItems() returns an EntriesCursor that
      // drops `meta`, so unread_count is lost. Use the raw GET instead.
      const page = (await client.get(
        `/v1/users/${encodeURIComponent(String(userId))}/feeds/${feedChannelId}`
      )) as {
        entries: Knock.Users.FeedListItemsResponse[];
        meta?: { unread_count?: number };
      };
      const items = page.entries.map((entry): FeedRow => {
        const block = (name: string) =>
          entry.blocks.find((b) => "name" in b && b.name === name) as
            | { rendered?: string }
            | undefined;
        return {
          id: entry.id,
          type: entry.source.key,
          title: String(entry.data?.title ?? entry.source.key),
          body: block("body")?.rendered ?? "",
          url: block("action_url")?.rendered ?? null,
          createdAt: entry.inserted_at,
          read: entry.read_at != null,
        };
      });
      const meta = page.meta;
      return {
        items,
        unreadCount: meta?.unread_count ?? items.filter((i) => !i.read).length,
      };
    },
    async markRead(_userId, ids) {
      if (ids.length === 0) return;
      await client.messages.batch.markAsRead({ message_ids: ids });
    },
  };
}

// ─── Local (credential-free) ───

const LOCAL_FILE = ".notifications-prototype.json"; // PROTOTYPE, wipe me

type LocalRow = FeedRow & { userId: number };

function readLocal(): LocalRow[] {
  return existsSync(LOCAL_FILE) ? JSON.parse(readFileSync(LOCAL_FILE, "utf8")) : [];
}

function writeLocal(rows: LocalRow[]) {
  writeFileSync(LOCAL_FILE, JSON.stringify(rows, null, 2));
}

function localService(): NotificationService {
  return {
    kind: "local",
    async notify(type, recipient, data) {
      const entry = catalogue[type];
      // Mirrors the Knock workflow: Email step, then In-app step. Locked, so
      // no preference check.
      await sendEmail({
        to: recipient.email,
        subject: entry.title(data),
        body: entry.localEmailBody(data),
      });
      const rows = readLocal();
      rows.unshift({
        id: `local-${Date.now()}`,
        userId: recipient.id,
        type: entry.workflow,
        title: entry.title(data),
        body: entry.localInAppBody(data),
        url: entry.url(data),
        createdAt: new Date().toISOString(),
        read: false,
      });
      writeLocal(rows);
    },
    async listFeed(userId) {
      const items = readLocal().filter((r) => r.userId === userId);
      return { items, unreadCount: items.filter((i) => !i.read).length };
    },
    async markRead(userId, ids) {
      writeLocal(
        readLocal().map((r) =>
          r.userId === userId && ids.includes(r.id) ? { ...r, read: true } : r
        )
      );
    },
  };
}

export function notificationService(): NotificationService {
  const key = process.env.KNOCK_API_SECRET_KEY;
  const feed = process.env.KNOCK_FEED_CHANNEL_ID;
  if (key && feed && !process.env.VITEST) return knockService(key, feed);
  return localService();
}
