import { data } from "react-router";
import { z } from "zod";
import { parseFormData } from "~/lib/validation";
import { isNotificationKey, NOTIFICATIONS } from "./catalogue";
import type { Bell } from "./bell";
import type { NotificationService } from "./service.server";

// ─── The bell, on the server ───
// Reads a person's feed for the sidebar bell and applies what they do in the
// popover. Everything goes through the NotificationService, so the bell works
// the same against Knock and the local service.

const FALLBACK_ICON = "bell";

/** Reading the feed never marks anything read. */
export async function readBell(
  service: NotificationService,
  userId: number
): Promise<Bell> {
  const feed = await service.getFeed(userId);
  return {
    unreadCount: feed.unreadCount,
    items: feed.items.map((item) => ({
      id: item.id,
      icon: isNotificationKey(item.type)
        ? NOTIFICATIONS[item.type].icon
        : FALLBACK_ICON,
      title: item.title,
      body: item.body,
      actionUrl: item.actionUrl,
      insertedAt: item.insertedAt,
      unread: item.readAt === null,
    })),
  };
}

/**
 * How long a page waits for the feed. Knock's own timeout is longer, for the
 * drainer; a page would rather show no bell than hang.
 */
const BELL_TIMEOUT_MS = 3_000;

/**
 * readBell for the app layout: if the NotificationService fails or is slow
 * (Knock is down, say), logs it and returns null, so the page renders without
 * a bell instead of failing or hanging.
 */
export async function readBellOrNothing(
  service: NotificationService,
  userId: number,
  { timeoutMs = BELL_TIMEOUT_MS }: { timeoutMs?: number } = {}
): Promise<Bell | null> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`The feed took longer than ${timeoutMs} ms`)),
      timeoutMs
    );
  });
  try {
    return await Promise.race([readBell(service, userId), timeout]);
  } catch (error) {
    console.error(
      "[notifications] Showing no bell; reading the feed failed:",
      error
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const bellActionSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("mark-read"), itemId: z.string().min(1) }),
  z.object({ intent: z.literal("mark-all-read") }),
]);

/** Only relative paths on Cadence itself, never another site. */
function safeTarget(actionUrl: string | null): string | null {
  if (!actionUrl) return null;
  if (!actionUrl.startsWith("/") || actionUrl.startsWith("//")) return null;
  return actionUrl;
}

/**
 * Marks one Notification read (and says where it points) or marks them all
 * read. Throws a 400 for an unknown action and a 404 for an item that isn't
 * in the person's own feed.
 */
export async function applyBellAction(
  service: NotificationService,
  userId: number,
  formData: FormData
): Promise<{ redirectTo: string | null }> {
  const parsed = parseFormData(formData, bellActionSchema);
  if (!parsed.success)
    throw data("Unknown notification action", { status: 400 });

  if (parsed.data.intent === "mark-all-read") {
    await service.markAllRead(userId);
    return { redirectTo: null };
  }

  const { itemId } = parsed.data;
  const feed = await service.getFeed(userId);
  const item = feed.items.find((candidate) => candidate.id === itemId);
  if (!item) throw data("Notification not found", { status: 404 });

  await service.markRead(userId, item.id);
  return { redirectTo: safeTarget(item.actionUrl) };
}
