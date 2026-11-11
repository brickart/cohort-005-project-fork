import Knock, { APIError } from "@knocklabs/node";
import { z } from "zod";
import {
  CHANNELS,
  DEFAULT_PREFERENCES,
  fromKnockPreferenceSet,
  toKnockPreferenceSet,
  type ChannelChoices,
  type KnockPreferenceSet,
} from "./preferences";
import {
  NotificationDeliveryError,
  type FeedItem,
  type NotificationService,
} from "./service.server";

// ─── The Knock NotificationService ───
// Delivers through Knock and reads the feed and Notification Preferences from
// it. Server-side only: no Knock key, token or socket reaches the browser.
// The Knock user id is String(user.id); recipients are identified inline at
// trigger time from data.recipient.

export type KnockNotificationServiceOptions = {
  apiKey: string;
  /** The In-app feed channel's id (KNOCK_FEED_CHANNEL_ID). */
  feedChannelId: string;
  /** For tests: where the Knock API lives and how to reach it. */
  baseURL?: string;
  fetch?: (
    input: string | URL | Request,
    init?: RequestInit
  ) => Promise<Response>;
  /** Per request, in milliseconds. */
  timeout?: number;
  maxRetries?: number;
};

function recipientOf(recipientId: number, data: Record<string, unknown>) {
  const recipient = data.recipient;
  const fields =
    typeof recipient === "object" && recipient !== null ? recipient : {};
  return {
    id: String(recipientId),
    ...("email" in fields && typeof fields.email === "string"
      ? { email: fields.email }
      : {}),
    ...("name" in fields && typeof fields.name === "string"
      ? { name: fields.name }
      : {}),
  };
}

// ─── The feed ───

/** Knock's largest feed page. The bell shows recent Notifications only. */
const FEED_PAGE_SIZE = 50;
/** Mark all read stops after this many pages of unread items. */
const MAX_UNREAD_PAGES = 20;

type KnockFeedBlock = {
  name: string;
  type?: string;
  content?: string;
  rendered?: string;
};

type KnockFeedEntry = {
  id: string;
  inserted_at: string;
  read_at: string | null;
  source: { key: string };
  data?: Record<string, unknown> | null;
  blocks: KnockFeedBlock[];
};

type KnockFeedPage = {
  entries: KnockFeedEntry[];
  meta?: { unread_count?: number };
  page_info?: { after?: string | null };
};

function feedPath(feedChannelId: string, userId: number) {
  return `/v1/users/${encodeURIComponent(String(userId))}/feeds/${encodeURIComponent(feedChannelId)}`;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Knock renders the markdown body to HTML; the bell shows plain text. */
function htmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
      if (name.startsWith("#x") || name.startsWith("#X")) {
        return String.fromCodePoint(parseInt(name.slice(2), 16));
      }
      if (name.startsWith("#")) {
        return String.fromCodePoint(parseInt(name.slice(1), 10));
      }
      return ENTITIES[name.toLowerCase()] ?? entity;
    })
    .trim();
}

function toFeedItem(entry: KnockFeedEntry): FeedItem {
  const block = (name: string) => entry.blocks.find((b) => b.name === name);
  const body = block("body");
  const actionUrl = block("action_url");
  const title = entry.data?.title;
  return {
    id: entry.id,
    type: entry.source.key,
    title: typeof title === "string" ? title : entry.source.key,
    body: htmlToText(body?.rendered ?? body?.content ?? ""),
    actionUrl: (actionUrl?.rendered ?? actionUrl?.content) || null,
    insertedAt: entry.inserted_at,
    readAt: entry.read_at,
  };
}

// ─── Notification Preferences ───

/** Cadence keeps everything in each person's default PreferenceSet. */
const PREFERENCE_SET_ID = "default";

/** A choice Cadence can't read (such as a condition) counts as no choice. */
const channelChoice = z.boolean().optional().catch(undefined);

const channelChoicesSchema = z
  .object({ email: channelChoice, in_app_feed: channelChoice })
  .nullish()
  .catch(null)
  .transform((value) => {
    const choices: ChannelChoices = {};
    for (const channel of CHANNELS) {
      const choice = value?.[channel];
      if (choice !== undefined) choices[channel] = choice;
    }
    return choices;
  });

/** A setting Cadence can't read counts as no setting. */
const settingSchema = z
  .union([z.boolean(), z.object({ channel_types: channelChoicesSchema })])
  .optional()
  .catch(undefined);

const settingsSchema = z
  .record(z.string(), settingSchema)
  .nullish()
  .catch(null)
  .transform((value) => {
    const settings: KnockPreferenceSet["workflows"] = {};
    for (const [key, setting] of Object.entries(value ?? {})) {
      if (setting !== undefined) settings[key] = setting;
    }
    return settings;
  });

/**
 * Knock's PreferenceSet, cut down to the parts Cadence uses. Channel types
 * Cadence doesn't send on, conditions and per-channel settings are ignored.
 */
const cadencePreferenceSetSchema: z.ZodType<
  KnockPreferenceSet,
  z.ZodTypeDef,
  unknown
> = z.object({
  channel_types: channelChoicesSchema,
  workflows: settingsSchema,
  categories: settingsSchema,
});

// ─── Errors ───

/**
 * Turns whatever Knock or the network threw into a NotificationDeliveryError,
 * so the drainer can tell retryable from not. A request that got no answer
 * (connection error, timeout) has no status.
 */
function asDeliveryError(error: unknown): NotificationDeliveryError {
  if (error instanceof APIError) {
    return new NotificationDeliveryError(
      error.message,
      typeof error.status === "number" ? error.status : null
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  return new NotificationDeliveryError(message, null);
}

export function createKnockNotificationService(
  options: KnockNotificationServiceOptions
): NotificationService {
  const client = new Knock({
    apiKey: options.apiKey,
    baseURL: options.baseURL,
    fetch: options.fetch,
    timeout: options.timeout,
    maxRetries: options.maxRetries,
  });

  return {
    async deliver({ type, recipientId, data, idempotencyKey }) {
      try {
        await client.workflows.trigger(
          type,
          { recipients: [recipientOf(recipientId, data)], data },
          { idempotencyKey }
        );
      } catch (error) {
        throw asDeliveryError(error);
      }
    },
    async getFeed(userId) {
      // The raw GET, because users.feeds.listItems() drops `meta`.
      const page = await client.get<KnockFeedPage>(
        feedPath(options.feedChannelId, userId),
        { query: { page_size: FEED_PAGE_SIZE } }
      );
      return {
        items: page.entries.map(toFeedItem),
        // Knock's own count of unread items, not unseen_count.
        unreadCount: page.meta?.unread_count ?? 0,
      };
    },
    async markRead(_userId, itemId) {
      // A feed item's id is its Knock message id. The caller has already
      // checked the item is in this person's feed.
      await client.messages.markAsRead(itemId);
    },
    async markAllRead(userId) {
      const ids: string[] = [];
      let after: string | undefined;
      for (let page = 0; page < MAX_UNREAD_PAGES; page++) {
        const { entries, page_info } = await client.get<KnockFeedPage>(
          feedPath(options.feedChannelId, userId),
          {
            query: {
              status: "unread",
              page_size: FEED_PAGE_SIZE,
              ...(after ? { after } : {}),
            },
          }
        );
        ids.push(...entries.map((entry) => entry.id));
        after = page_info?.after ?? undefined;
        if (!after) break;
      }
      if (ids.length === 0) return;
      await client.messages.batch.markAsRead({ message_ids: ids });
    },
    async getPreferences(userId) {
      try {
        const set = await client.users.getPreferences(
          String(userId),
          PREFERENCE_SET_ID
        );
        return fromKnockPreferenceSet(cadencePreferenceSetSchema.parse(set));
      } catch (error) {
        // Knock doesn't know this person yet: nothing has been sent to them.
        if (error instanceof APIError && error.status === 404) {
          return DEFAULT_PREFERENCES;
        }
        throw error;
      }
    },
    async setPreferences(userId, preferences) {
      const id = String(userId);
      // Replaces the whole set, so what Knock holds is exactly what /settings
      // shows.
      const write = () =>
        client.users.setPreferences(
          id,
          PREFERENCE_SET_ID,
          toKnockPreferenceSet(preferences)
        );
      try {
        await write();
      } catch (error) {
        if (!(error instanceof APIError && error.status === 404)) throw error;
        // Someone can change their preferences before anything was ever sent
        // to them, so Knock may not have identified them yet.
        await client.users.update(id, {});
        await write();
      }
    },
  };
}
