import { db } from "~/db";
import { createKnockNotificationService } from "./knock-service.server";
import { createLocalNotificationService } from "./local-service.server";
import { deliverPending } from "./outbox.server";
import type { NotificationService } from "./service.server";

// ─── Notifications in the running app ───
// Picks the NotificationService and runs the drainer inside the app server
// process. There is no separate worker: the root middleware kicks the drainer
// after every write request (drainer-kick.server.ts), and it also sweeps at
// boot and about once a minute.

const SWEEP_INTERVAL_MS = 60_000;

let service: NotificationService | undefined;

export type NotificationServiceChoice =
  | { kind: "memory" }
  | { kind: "local" }
  | { kind: "knock"; apiKey: string; feedChannelId: string };

type Env = Record<string, string | undefined>;

/**
 * Knock whenever KNOCK_API_SECRET_KEY is set (npm run dev:knock loads it from
 * .env), the local service otherwise, and always the local one, in memory,
 * under vitest. The one place that decides whether this is a test run.
 */
export function notificationServiceChoice(env: Env): NotificationServiceChoice {
  if (env.VITEST) return { kind: "memory" };
  const apiKey = env.KNOCK_API_SECRET_KEY;
  if (!apiKey) return { kind: "local" };
  const feedChannelId = env.KNOCK_FEED_CHANNEL_ID;
  if (!feedChannelId) {
    throw new Error(
      "KNOCK_API_SECRET_KEY is set but KNOCK_FEED_CHANNEL_ID is not. Set both in .env to use Knock, or neither to stay local."
    );
  }
  return { kind: "knock", apiKey, feedChannelId };
}

/**
 * The service the app runs on. Dev without credentials keeps the feed in
 * .notifications/store.json and Emails in .outbox/; tests keep everything in
 * memory.
 */
export function getNotificationService(): NotificationService {
  if (service) return service;

  service = createNotificationService(notificationServiceChoice(process.env));
  return service;
}

function createNotificationService(
  choice: NotificationServiceChoice
): NotificationService {
  switch (choice.kind) {
    case "knock":
      return createKnockNotificationService({
        apiKey: choice.apiKey,
        feedChannelId: choice.feedChannelId,
        // Well inside the drainer's 2 minute lease, and short enough that a
        // slow Knock doesn't hold up a page that reads the feed for long.
        timeout: 15_000,
        maxRetries: 1,
      });
    case "memory":
      return createLocalNotificationService();
    case "local":
      return createLocalNotificationService({
        storePath: ".notifications/store.json",
        outboxDir: ".outbox",
      });
  }
}

/**
 * Delivers whatever is due, without making the caller wait. Never call it
 * inside a transaction; the root middleware calls it after each write.
 */
export function kickNotificationDrainer(): void {
  deliverPending(db, getNotificationService()).catch((error: unknown) => {
    console.error("[notifications] The outbox drain failed:", error);
  });
}

// Survives dev-server module reloads, so there is only ever one sweep.
const SWEEP_KEY = Symbol.for("cadence.notificationSweep");
type WithSweep = typeof globalThis & { [SWEEP_KEY]?: NodeJS.Timeout };

/** Sweeps once now and then about once a minute. Safe to call repeatedly. */
export function startNotificationDrainer(): void {
  const global = globalThis as WithSweep;
  if (global[SWEEP_KEY]) return;

  kickNotificationDrainer();
  const timer = setInterval(kickNotificationDrainer, SWEEP_INTERVAL_MS);
  timer.unref();
  global[SWEEP_KEY] = timer;
}
