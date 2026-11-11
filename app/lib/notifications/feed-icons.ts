import {
  Bell,
  BookOpen,
  CircleCheck,
  CircleX,
  Inbox,
  MessageCircleQuestion,
  MessageSquareReply,
  Receipt,
  ShoppingBag,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

// ─── Feed icons ───
// The catalogue names each Notification's icon as a string; this turns the
// name into a lucide-react component for the bell. A new catalogue icon needs
// an entry here (feed-icons.test.ts fails until it has one).

export const FEED_ICONS: Record<string, LucideIcon> = {
  bell: Bell,
  "book-open": BookOpen,
  "circle-check": CircleCheck,
  "circle-x": CircleX,
  inbox: Inbox,
  "message-circle-question": MessageCircleQuestion,
  "message-square-reply": MessageSquareReply,
  receipt: Receipt,
  "shopping-bag": ShoppingBag,
  "user-plus": UserPlus,
};

export function feedIcon(name: string): LucideIcon {
  return Object.hasOwn(FEED_ICONS, name) ? FEED_ICONS[name] : Bell;
}
