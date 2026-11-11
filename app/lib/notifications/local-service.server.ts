import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isNotificationKey, NOTIFICATIONS } from "./catalogue";
import {
  DEFAULT_KNOCK_DIR,
  renderEmail,
  renderInApp,
} from "./knock-templates.server";
import {
  NotificationDeliveryError,
  type Feed,
  type FeedItem,
  type NotificationService,
} from "./service.server";

// ─── The local NotificationService ───
// Stands in for Knock when there are no credentials: in dev (a gitignored
// JSON store) and always under vitest (memory). It renders Emails from
// .knock/ and writes them to .outbox/, and keeps each person's feed with read
// state, so the bell works when you switch users in the DevUI panel.

const FROM_ADDRESS = "Cadence <hello@cadence.dev>";

type StoredItem = FeedItem & { userId: number };

type Store = {
  items: StoredItem[];
  /** Idempotency keys already delivered, as Knock would remember them. */
  deliveredKeys: string[];
};

export type LocalNotificationServiceOptions = {
  /** Where to keep the feed. Omit to keep it in memory. */
  storePath?: string;
  /** Where to write rendered Emails. Omit to render them and drop them. */
  outboxDir?: string;
  knockDir?: string;
  clock?: () => Date;
};

function emptyStore(): Store {
  return { items: [], deliveredKeys: [] };
}

export function createLocalNotificationService(
  options: LocalNotificationServiceOptions = {}
): NotificationService {
  const {
    storePath,
    outboxDir,
    knockDir = DEFAULT_KNOCK_DIR,
    clock = () => new Date(),
  } = options;
  let memory = emptyStore();

  function load(): Store {
    if (!storePath) return memory;
    if (!existsSync(storePath)) return emptyStore();
    return { ...emptyStore(), ...JSON.parse(readFileSync(storePath, "utf8")) };
  }

  function save(store: Store) {
    if (!storePath) {
      memory = store;
      return;
    }
    mkdirSync(dirname(storePath), { recursive: true });
    writeFileSync(storePath, JSON.stringify(store, null, 2));
  }

  function writeEmail(type: string, data: Record<string, unknown>, at: Date) {
    // Rendered even when there is nowhere to write it, so a broken template
    // fails the same way it would in Knock.
    const email = renderEmail(type, data, knockDir);
    if (!outboxDir) return;

    const recipient = data.recipient;
    const to =
      typeof recipient === "object" &&
      recipient !== null &&
      "email" in recipient &&
      typeof recipient.email === "string"
        ? recipient.email
        : "unknown";

    mkdirSync(outboxDir, { recursive: true });
    const base = join(outboxDir, `${at.getTime()}-${type}-${to}`);
    writeFileSync(
      `${base}.json`,
      JSON.stringify(
        {
          from: FROM_ADDRESS,
          to,
          subject: email.subject,
          html: email.html,
          text: email.text,
          layout: email.layout,
          workflow: type,
        },
        null,
        2
      )
    );
    writeFileSync(`${base}.html`, email.html);
  }

  return {
    async deliver(notification) {
      const { type, data, recipientId, idempotencyKey } = notification;
      if (!isNotificationKey(type)) {
        throw new NotificationDeliveryError(`No workflow called ${type}`, 404);
      }

      const store = load();
      if (store.deliveredKeys.includes(idempotencyKey)) return;

      const at = clock();
      const { channels } = NOTIFICATIONS[type];

      if (channels.includes("email")) writeEmail(type, data, at);

      const items = [...store.items];
      if (channels.includes("in_app_feed")) {
        const inApp = renderInApp(type, data, knockDir);
        items.unshift({
          id: randomUUID(),
          userId: recipientId,
          type,
          title: typeof data.title === "string" ? data.title : type,
          body: inApp.body,
          actionUrl: inApp.actionUrl || null,
          insertedAt: at.toISOString(),
          readAt: null,
        });
      }

      save({
        items,
        deliveredKeys: [...store.deliveredKeys, idempotencyKey],
      });
    },

    async getFeed(userId): Promise<Feed> {
      const items = load()
        .items.filter((item) => item.userId === userId)
        .sort((a, b) => b.insertedAt.localeCompare(a.insertedAt))
        .map(({ userId: _userId, ...item }) => item);
      return {
        items,
        unreadCount: items.filter((item) => item.readAt === null).length,
      };
    },

    async markRead(userId, itemId) {
      const store = load();
      const at = clock().toISOString();
      save({
        ...store,
        items: store.items.map((item) =>
          item.userId === userId && item.id === itemId && item.readAt === null
            ? { ...item, readAt: at }
            : item
        ),
      });
    },

    async markAllRead(userId) {
      const store = load();
      const at = clock().toISOString();
      save({
        ...store,
        items: store.items.map((item) =>
          item.userId === userId && item.readAt === null
            ? { ...item, readAt: at }
            : item
        ),
      });
    },
  };
}
