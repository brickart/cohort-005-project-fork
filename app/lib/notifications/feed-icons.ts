import { Bell, Inbox, Receipt, type LucideIcon } from "lucide-react";

// ─── Feed icons ───
// The catalogue names each Notification's icon as a string; this turns the
// name into a lucide-react component for the bell. A new catalogue icon needs
// an entry here (feed-icons.test.ts fails until it has one).

export const FEED_ICONS: Record<string, LucideIcon> = {
  bell: Bell,
  inbox: Inbox,
  receipt: Receipt,
};

export function feedIcon(name: string): LucideIcon {
  return Object.hasOwn(FEED_ICONS, name) ? FEED_ICONS[name] : Bell;
}
