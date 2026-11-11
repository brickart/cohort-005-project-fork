// PROTOTYPE (knock-end-to-end): rough bell + popover fed by the layout
// loader. Not the designed UI; just enough to see the feed round-trip.
import { useState } from "react";
import { useFetcher, useNavigate } from "react-router";
import { Bell } from "lucide-react";
import type { FeedRow } from "~/lib/notifications.prototype.server";

export function NotificationBellPrototype({
  feed,
}: {
  feed: { items: FeedRow[]; unreadCount: number; source: string; error?: string };
}) {
  const [open, setOpen] = useState(false);
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const unread = feed.unreadCount;

  function markRead(ids: string[]) {
    const form = new FormData();
    ids.forEach((id) => form.append("id", id));
    fetcher.submit(form, { method: "post", action: "/api/notifications-prototype" });
  }

  return (
    <div className="relative ml-auto">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative rounded p-1 hover:bg-sidebar-accent"
        aria-label="Notifications"
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-8 z-50 w-80 rounded-md border bg-popover p-2 text-popover-foreground shadow-lg">
          <div className="mb-2 flex items-center justify-between px-1 text-xs">
            <span className="font-semibold">
              Notifications <span className="opacity-50">({feed.source})</span>
            </span>
            {unread > 0 && (
              <button
                className="underline"
                onClick={() => markRead(feed.items.filter((i) => !i.read).map((i) => i.id))}
              >
                Mark all read
              </button>
            )}
          </div>
          {feed.error && <p className="px-1 text-xs text-red-600">{feed.error}</p>}
          {feed.items.length === 0 && (
            <p className="px-1 py-4 text-center text-sm opacity-60">You're all caught up</p>
          )}
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {feed.items.map((item) => (
              <li key={item.id}>
                <button
                  className="w-full rounded px-2 py-1.5 text-left hover:bg-accent"
                  onClick={() => {
                    if (!item.read) markRead([item.id]);
                    setOpen(false);
                    if (item.url) navigate(item.url);
                  }}
                >
                  <div className="flex items-center gap-2">
                    {!item.read && <span className="size-2 shrink-0 rounded-full bg-blue-600" />}
                    <span className={item.read ? "text-sm" : "text-sm font-bold"}>{item.title}</span>
                  </div>
                  <div
                    className="text-xs opacity-70 [&_p]:m-0"
                    dangerouslySetInnerHTML={{ __html: item.body }}
                  />
                  <div className="text-[10px] opacity-50">
                    {new Date(item.createdAt).toLocaleString()} · {item.type}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <pre className="mt-2 max-h-32 overflow-auto rounded bg-muted p-1 text-[10px]">
            {JSON.stringify(feed, null, 1)}
          </pre>
        </div>
      )}
    </div>
  );
}
