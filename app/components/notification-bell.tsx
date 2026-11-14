import { useState } from "react";
import { Link, useFetcher } from "react-router";
import { Bell as BellIcon, Settings } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import {
  unreadBadgeLabel,
  type Bell,
  type BellItem,
} from "~/lib/notifications/bell";
import { feedIcon } from "~/lib/notifications/feed-icons";
import { cn, formatRelativeTime } from "~/lib/utils";

// The sidebar bell. The app layout loader reads the feed on every navigation;
// mark read and mark all read post to /api/notifications, which revalidates
// it. Opening the popover alone changes nothing.

const BELL_ACTION = "/api/notifications";

export function NotificationBell({ bell }: { bell: Bell }) {
  const [open, setOpen] = useState(false);
  const markAll = useFetcher();
  // Lives outside the popover, so closing it doesn't cancel the submit.
  const markRead = useFetcher();
  const badge = unreadBadgeLabel(bell.unreadCount);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          aria-label={
            badge
              ? `Notifications, ${bell.unreadCount} unread`
              : "Notifications"
          }
        >
          <BellIcon className="size-4" />
          {badge && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] leading-none font-semibold text-white">
              {badge}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          <div className="flex items-center gap-1">
            {bell.unreadCount > 0 && (
              <markAll.Form method="post" action={BELL_ACTION}>
                <input type="hidden" name="intent" value="mark-all-read" />
                <button
                  type="submit"
                  className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  Mark all read
                </button>
              </markAll.Form>
            )}
            <Link
              to="/settings"
              onClick={() => setOpen(false)}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              aria-label="Notification Preferences"
            >
              <Settings className="size-4" />
            </Link>
          </div>
        </div>
        {bell.items.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            You're all caught up
          </p>
        ) : (
          <ul className="max-h-96 divide-y overflow-y-auto">
            {bell.items.map((item) => (
              <li key={item.id}>
                <FeedRow
                  item={item}
                  onChoose={() => {
                    markRead.submit(
                      { intent: "mark-read", itemId: item.id },
                      { method: "post", action: BELL_ACTION }
                    );
                    setOpen(false);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

function FeedRow({ item, onChoose }: { item: BellItem; onChoose: () => void }) {
  const Icon = feedIcon(item.icon);

  return (
    <button
      type="button"
      onClick={onChoose}
      className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-accent"
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-sm",
            item.unread ? "font-semibold" : "font-normal"
          )}
        >
          {item.title}
        </span>
        <span className="block text-xs text-muted-foreground">{item.body}</span>
        <span
          className="mt-0.5 block text-[11px] text-muted-foreground"
          suppressHydrationWarning
        >
          {formatRelativeTime(item.insertedAt)}
        </span>
      </span>
      {item.unread && (
        <span
          className="mt-1.5 size-2 shrink-0 rounded-full bg-blue-500"
          aria-label="Unread"
        />
      )}
    </button>
  );
}
