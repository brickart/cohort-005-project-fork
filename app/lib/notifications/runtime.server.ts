import { db } from "~/db";
import { createLocalNotificationService } from "./local-service.server";
import { deliverPending } from "./outbox.server";
import type { NotificationService } from "./service.server";

// ─── Notifications in the running app ───
// Picks the NotificationService and runs the drainer inside the app server
// process. There is no separate worker: callers kick the drainer after their
// transaction commits, and it also sweeps at boot and about once a minute.

const SWEEP_INTERVAL_MS = 60_000;

let service: NotificationService | undefined;

/**
 * The local service whenever KNOCK_API_SECRET_KEY is absent, and always under
 * vitest. Dev keeps the feed in .notifications/store.json and Emails in
 * .outbox/; tests keep everything in memory.
 */
export function getNotificationService(): NotificationService {
  if (service) return service;

  if (process.env.VITEST) {
    service = createLocalNotificationService();
  } else {
    if (process.env.KNOCK_API_SECRET_KEY) {
      // The Knock implementation arrives in a later ticket.
      console.warn(
        "[notifications] KNOCK_API_SECRET_KEY is set, but Cadence has no Knock NotificationService yet. Using the local one."
      );
    }
    service = createLocalNotificationService({
      storePath: ".notifications/store.json",
      outboxDir: ".outbox",
    });
  }

  return service;
}

/**
 * Delivers whatever is due, without making the caller wait. Call it after the
 * transaction that enqueued Notifications has committed.
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
