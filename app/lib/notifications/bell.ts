// ─── The bell ───
// What the sidebar bell shows, in code the browser can load too.

export type BellItem = {
  id: string;
  /** A lucide-react icon name, from the catalogue. */
  icon: string;
  title: string;
  body: string;
  /** Relative path to what it is about. */
  actionUrl: string | null;
  insertedAt: string;
  unread: boolean;
};

export type Bell = {
  /** Newest first. */
  items: BellItem[];
  unreadCount: number;
};

/** The red badge on the bell: the unread count, "9+" above nine, or nothing. */
export function unreadBadgeLabel(unreadCount: number): string | null {
  if (unreadCount <= 0) return null;
  return unreadCount > 9 ? "9+" : String(unreadCount);
}
