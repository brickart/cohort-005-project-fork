import { randomUUID } from "node:crypto";
import { and, eq, lt, lte, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { notificationOutbox, OutboxStatus } from "~/db/schema";
import {
  NOTIFICATIONS,
  type NotificationDataMap,
  type NotificationKey,
} from "./catalogue";
import {
  isRetryableDeliveryError,
  type NotificationService,
} from "./service.server";

// ─── The Notification outbox ───
// Domain functions write Notifications here inside their own transaction, and
// the drainer hands them to the NotificationService after commit. A
// Notification is never lost when the change commits, and never sent when it
// rolls back. See docs/adr/0008.

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Queryable = Db | Tx;

/** One Notification a domain function wants sent. */
export type NotificationIntent = {
  [K in NotificationKey]: {
    type: K;
    recipientId: number;
    data: NotificationDataMap[K];
  };
}[NotificationKey];

export type EnqueuedNotification = NotificationIntent & {
  idempotencyKey: string;
};

/**
 * Writes outbox rows inside the caller's transaction. Nobody is notified about
 * their own action, so intents whose recipient is the actor are dropped here.
 * Locked Notifications are the exception: they exist to answer something the
 * person did (a receipt, a Refund Request confirmation), so the actor is
 * exactly who they are for. Returns what was enqueued.
 */
export function enqueueNotifications(
  tx: Queryable,
  intents: NotificationIntent[],
  actorId: number | null,
  now: Date = new Date()
): EnqueuedNotification[] {
  const enqueued = intents
    .filter(
      (intent) =>
        intent.recipientId !== actorId || NOTIFICATIONS[intent.type].locked
    )
    .map((intent) => ({ ...intent, idempotencyKey: randomUUID() }));

  if (enqueued.length === 0) return [];

  const at = now.toISOString();
  tx.insert(notificationOutbox)
    .values(
      enqueued.map((notification) => ({
        idempotencyKey: notification.idempotencyKey,
        type: notification.type,
        recipientId: notification.recipientId,
        actorId,
        data: JSON.stringify(notification.data),
        status: OutboxStatus.Pending,
        nextAttemptAt: at,
        createdAt: at,
      }))
    )
    .run();

  return enqueued;
}

// ─── The drainer ───

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How long a claimed row is held before another drain may take it. */
const LEASE_MS = 2 * MINUTE;

/** The waits between attempts. After the last retry fails, the row fails. */
export const RETRY_DELAYS_MS = [
  1 * MINUTE,
  5 * MINUTE,
  30 * MINUTE,
  2 * HOUR,
  12 * HOUR,
] as const;

/** Delivered rows are kept this long. Failed rows are kept for good. */
const DELIVERED_RETENTION_MS = 30 * DAY;

export type DrainSummary = {
  delivered: number;
  retried: number;
  failed: number;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Delivers every pending outbox row that is due, through `service`.
 *
 * Rows are claimed with a lease (attempts + 1, next attempt pushed back), so
 * concurrent drains never send the same row. A crashed send's lease simply
 * expires and the row is claimed again. Network errors, 5xx and 429 are
 * retried on RETRY_DELAYS_MS; any other error fails the row at once.
 */
export async function deliverPending(
  db: Db,
  service: NotificationService,
  now: Date = new Date()
): Promise<DrainSummary> {
  const summary: DrainSummary = { delivered: 0, retried: 0, failed: 0 };
  const at = now.toISOString();

  db.delete(notificationOutbox)
    .where(
      and(
        eq(notificationOutbox.status, OutboxStatus.Delivered),
        lt(
          notificationOutbox.deliveredAt,
          new Date(now.getTime() - DELIVERED_RETENTION_MS).toISOString()
        )
      )
    )
    .run();

  // A single UPDATE … RETURNING is atomic in SQLite, so two drains can't
  // claim the same row.
  const claimed = db
    .update(notificationOutbox)
    .set({
      attempts: sql`${notificationOutbox.attempts} + 1`,
      nextAttemptAt: new Date(now.getTime() + LEASE_MS).toISOString(),
    })
    .where(
      and(
        eq(notificationOutbox.status, OutboxStatus.Pending),
        lte(notificationOutbox.nextAttemptAt, at)
      )
    )
    .returning()
    .all();

  for (const row of claimed) {
    try {
      await service.deliver({
        idempotencyKey: row.idempotencyKey,
        type: row.type,
        recipientId: row.recipientId,
        actorId: row.actorId,
        data: JSON.parse(row.data),
      });

      db.update(notificationOutbox)
        .set({
          status: OutboxStatus.Delivered,
          deliveredAt: at,
          lastError: null,
        })
        .where(eq(notificationOutbox.id, row.id))
        .run();
      summary.delivered++;
    } catch (error) {
      const lastError = errorMessage(error);
      const delay = RETRY_DELAYS_MS[row.attempts - 1];

      if (isRetryableDeliveryError(error) && delay !== undefined) {
        db.update(notificationOutbox)
          .set({
            lastError,
            nextAttemptAt: new Date(now.getTime() + delay).toISOString(),
          })
          .where(eq(notificationOutbox.id, row.id))
          .run();
        summary.retried++;
      } else {
        db.update(notificationOutbox)
          .set({ status: OutboxStatus.Failed, lastError })
          .where(eq(notificationOutbox.id, row.id))
          .run();
        summary.failed++;
        console.error(
          `[notifications] ${row.type} to user ${row.recipientId} failed after ${row.attempts} attempt(s): ${lastError}`
        );
      }
    }
  }

  return summary;
}
