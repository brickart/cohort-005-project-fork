// ─── The NotificationService seam ───
// Cadence's own interface to whatever delivers Notifications and keeps the
// feed. Knock in production; a local implementation with no credentials in
// dev and tests (local-service.server.ts). Nothing outside this seam knows
// which one is in use.

import type { NotificationPreferences } from "./preferences";

/** One outbox row, handed over for delivery. `data` is forwarded as-is. */
export type OutboundNotification = {
  /** Sent as Knock's Idempotency-Key. */
  idempotencyKey: string;
  /** The catalogue key, which is also the Knock workflow key. */
  type: string;
  recipientId: number;
  actorId: number | null;
  data: Record<string, unknown>;
};

/** One In-app Notification in a person's feed. */
export type FeedItem = {
  id: string;
  /** The catalogue key it came from. */
  type: string;
  title: string;
  body: string;
  /** Relative path to what it is about. */
  actionUrl: string | null;
  insertedAt: string;
  readAt: string | null;
};

export type Feed = {
  /** Newest first. */
  items: FeedItem[];
  unreadCount: number;
};

export interface NotificationService {
  deliver(notification: OutboundNotification): Promise<void>;
  getFeed(userId: number): Promise<Feed>;
  markRead(userId: number, itemId: string): Promise<void>;
  markAllRead(userId: number): Promise<void>;
  /** A person's Notification Preferences, including Mute. */
  getPreferences(userId: number): Promise<NotificationPreferences>;
  /** Replaces a person's Notification Preferences, including Mute. */
  setPreferences(
    userId: number,
    preferences: NotificationPreferences
  ): Promise<void>;
}

/**
 * Thrown by a NotificationService when delivery is refused. `status` is the
 * HTTP status, or null when the request never got an answer (network error).
 */
export class NotificationDeliveryError extends Error {
  constructor(
    message: string,
    readonly status: number | null
  ) {
    super(message);
    this.name = "NotificationDeliveryError";
  }
}

/**
 * Network errors, 5xx and 429 are worth trying again. Any other 4xx means the
 * request itself is wrong, so retrying won't help. An error that isn't a
 * NotificationDeliveryError never reached an answer, so it counts as a network
 * error.
 */
export function isRetryableDeliveryError(error: unknown): boolean {
  if (!(error instanceof NotificationDeliveryError)) return true;
  const { status } = error;
  return status === null || status === 429 || status >= 500;
}
