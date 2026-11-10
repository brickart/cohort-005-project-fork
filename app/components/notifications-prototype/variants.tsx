// PROTOTYPE — throwaway. Three structurally different takes on Notifications in Cadence
// (wayfinder ticket #9), switchable with ?variant=A|B|C on any page:
//   A  Popover + grid:              bell in the sidebar header → popover feed; Preferences = types × Channels table.
//                                   Browser prompt: native prompt fires straight from the Browser column.
//   B  Drawer + grouped cards:      "Notifications" sidebar nav item → right drawer (Unread/All, day buckets);
//                                   Preferences = cards per area with Channel chips. Browser prompt: in-app
//                                   explainer first, then the native prompt.
//   C  Inbox panel + channel-first: top bar bell → two-pane inbox (list + detail); Preferences = one card per Channel.
//                                   Browser prompt: contextual banner inside the inbox and on the Browser card.

import { useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  Bell,
  BellOff,
  Check,
  CircleDollarSign,
  Lock,
  Mail,
  Megaphone,
  MessageSquare,
  Monitor,
  Receipt,
  Settings,
  Ticket,
  UserPlus,
  X,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import {
  CATALOGUE,
  CHANNELS,
  type Channel,
  type FakeNotification,
  type NotificationType,
  useNotificationsPrototype,
  usePrototypeVariant,
} from "./store";

// ---- tiny shared atoms (not layout) ------------------------------------

const ICON: Record<NotificationType, React.ComponentType<{ className?: string }>> = {
  refundRaisedConfirmation: CircleDollarSign,
  refundRaisedToDecide: CircleDollarSign,
  refundApproved: CircleDollarSign,
  refundDeclined: CircleDollarSign,
  purchaseReceipt: Receipt,
  lessonQuestion: MessageSquare,
  commentReply: MessageSquare,
  newEnrollment: UserPlus,
  couponRedeemed: Ticket,
  courseStatus: Megaphone,
};

const CHANNEL_ICON: Record<Channel, React.ComponentType<{ className?: string }>> = {
  email: Mail,
  inApp: Bell,
  browser: Monitor,
};

function Switch({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        on ? "bg-primary" : "bg-muted-foreground/30"
      )}
    >
      <span className={cn("inline-block size-4 rounded-full bg-white shadow transition-transform", on ? "translate-x-4" : "translate-x-0.5")} />
    </button>
  );
}

function Badge({ n, className }: { n: number; className?: string }) {
  if (n === 0) return null;
  return (
    <span className={cn("flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-4 text-white", className)}>
      {n > 9 ? "9+" : n}
    </span>
  );
}

const LOCK_HINT = "Always sent by Email: it answers something you did. Mute doesn't affect it.";

function useOpen(n: FakeNotification, close: () => void) {
  const s = useNotificationsPrototype();
  const navigate = useNavigate();
  return () => {
    s.markRead(n.id);
    close();
    navigate(n.href);
  };
}

// ======================================================================
// Variant A — Popover + grid
// ======================================================================

function BellA() {
  const s = useNotificationsPrototype();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen((o) => !o)} className="relative ml-auto rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent" title="Notifications">
        <Bell className="size-4" />
        <Badge n={s.unread} className="absolute -right-1 -top-1" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fixed left-[13.5rem] top-2 z-50 w-96 rounded-lg border bg-popover text-popover-foreground shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <span className="font-semibold">Notifications</span>
              <div className="flex items-center gap-1">
                {s.unread > 0 && (
                  <button onClick={s.markAllRead} className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent">
                    Mark all read
                  </button>
                )}
                <Link to="/settings?variant=A#notifications" onClick={() => setOpen(false)} className="rounded p-1 text-muted-foreground hover:bg-accent" title="Notification Preferences">
                  <Settings className="size-4" />
                </Link>
              </div>
            </div>
            <div className="max-h-[28rem] overflow-y-auto">
              {s.notifications.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
                  <Bell className="size-8 opacity-40" />
                  <div className="font-medium text-foreground">You're all caught up</div>
                  <div>New Notifications show up here when you load a page.</div>
                </div>
              ) : (
                s.notifications.map((n) => <RowA key={n.id} n={n} close={() => setOpen(false)} />)
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function RowA({ n, close }: { n: FakeNotification; close: () => void }) {
  const open = useOpen(n, close);
  const Icon = ICON[n.type];
  return (
    <button onClick={open} className={cn("flex w-full gap-3 border-b px-4 py-3 text-left last:border-0 hover:bg-accent", !n.read && "bg-primary/5")}>
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className={cn("text-sm", !n.read ? "font-semibold" : "text-muted-foreground")}>{n.title}</div>
        <div className="line-clamp-2 text-xs text-muted-foreground">{n.body}</div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-[11px] text-muted-foreground">{n.ago}</span>
        {!n.read && <span className="size-2 rounded-full bg-blue-600" />}
      </div>
    </button>
  );
}

function PreferencesA() {
  const s = useNotificationsPrototype();
  const browserHeader = () => {
    if (s.browserPermission === "granted") return null;
    if (s.browserPermission === "denied")
      return <div className="text-[10px] font-normal text-red-600">Blocked by browser</div>;
    return (
      <button onClick={() => s.requestBrowserPermission()} className="text-[10px] font-normal text-primary underline">
        Turn on
      </button>
    );
  };
  const onCell = async (t: NotificationType, c: Channel, v: boolean) => {
    if (c === "browser" && v && s.browserPermission !== "granted") {
      const p = await s.requestBrowserPermission();
      if (p !== "granted") return;
    }
    s.setPref(t, c, v);
  };
  return (
    <Card className="mt-8 max-w-2xl" id="notifications">
      <CardHeader>
        <h2 className="text-lg font-semibold">Notification Preferences</h2>
        <p className="text-sm text-muted-foreground">Choose how you hear about each kind of Notification.</p>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 font-medium">Notification</th>
              {CHANNELS.map((c) => (
                <th key={c.key} className="w-24 py-2 text-center font-medium">
                  {c.label}
                  {c.key === "browser" && browserHeader()}
                </th>
              ))}
            </tr>
            <tr className="border-b bg-muted/40">
              <td className="py-2 pl-2">
                <label className="flex items-center gap-2 font-medium">
                  <input type="checkbox" checked={s.mute.all} onChange={(e) => s.setMute("all", e.target.checked)} />
                  Mute everything
                </label>
              </td>
              {CHANNELS.map((c) => (
                <td key={c.key} className="py-2 text-center">
                  <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <input type="checkbox" checked={s.mute[c.key]} onChange={(e) => s.setMute(c.key, e.target.checked)} />
                    mute
                  </label>
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {s.types.map((t) => (
              <tr key={t} className="border-b last:border-0">
                <td className="py-2.5">
                  <div className="font-medium">{CATALOGUE[t].label}</div>
                  <div className="text-xs text-muted-foreground">{CATALOGUE[t].description}</div>
                </td>
                {CHANNELS.map((c) => {
                  const locked = s.isLocked(t, c.key);
                  const muted = s.mute.all || s.mute[c.key];
                  return (
                    <td key={c.key} className="text-center">
                      {locked ? (
                        <Lock className="mx-auto size-4 text-muted-foreground" aria-label={LOCK_HINT} />
                      ) : (
                        <input
                          type="checkbox"
                          className={cn(muted && "opacity-30")}
                          checked={s.prefs[t][c.key] && (c.key !== "browser" || s.browserPermission === "granted")}
                          disabled={c.key === "browser" && s.browserPermission === "denied"}
                          onChange={(e) => onCell(t, c.key, e.target.checked)}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3" /> {LOCK_HINT}
        </p>
        {s.browserPermission === "denied" && (
          <p className="mt-2 text-xs text-red-600">
            Your browser is blocking Notifications from Cadence. Allow them in the site settings (the icon left of the address bar), then reload.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ======================================================================
// Variant B — Drawer + grouped cards
// ======================================================================

function NavB() {
  const s = useNotificationsPrototype();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"unread" | "all">("unread");
  const list = s.notifications.filter((n) => tab === "all" || !n.read);
  const buckets = ["Today", "This week", "Earlier"] as const;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <Bell className="size-4" />
        Notifications
        <Badge n={s.unread} className="ml-auto bg-primary" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="fixed inset-y-0 right-0 z-50 flex w-[26rem] flex-col border-l bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="text-lg font-semibold">Notifications</h2>
              <button onClick={() => setOpen(false)} className="rounded p-1 hover:bg-accent">
                <X className="size-4" />
              </button>
            </div>
            <div className="flex items-center gap-1 border-b px-5 py-2 text-sm">
              {(["unread", "all"] as const).map((k) => (
                <button key={k} onClick={() => setTab(k)} className={cn("rounded-full px-3 py-1 capitalize", tab === k ? "bg-foreground text-background" : "hover:bg-accent")}>
                  {k} {k === "unread" && s.unread > 0 && `(${s.unread})`}
                </button>
              ))}
              {s.unread > 0 && (
                <button onClick={s.markAllRead} className="ml-auto text-xs text-muted-foreground hover:underline">
                  Mark all read
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {list.length === 0 ? (
                <div className="px-8 py-16 text-center text-sm text-muted-foreground">
                  <Check className="mx-auto mb-3 size-8 opacity-40" />
                  {tab === "unread" ? (
                    <>
                      Nothing unread.{" "}
                      {s.notifications.length > 0 && (
                        <button className="text-primary underline" onClick={() => setTab("all")}>
                          See all
                        </button>
                      )}
                    </>
                  ) : (
                    "No Notifications yet."
                  )}
                </div>
              ) : (
                buckets.map((b) => {
                  const items = list.filter((n) => n.bucket === b);
                  if (!items.length) return null;
                  return (
                    <section key={b}>
                      <div className="sticky top-0 bg-background/95 px-5 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{b}</div>
                      {items.map((n) => (
                        <RowB key={n.id} n={n} close={() => setOpen(false)} />
                      ))}
                    </section>
                  );
                })
              )}
            </div>
            <Link to="/settings?variant=B#notifications" onClick={() => setOpen(false)} className="flex items-center gap-2 border-t px-5 py-3 text-sm text-muted-foreground hover:bg-accent">
              <Settings className="size-4" /> Notification Preferences →
            </Link>
          </aside>
        </>
      )}
    </>
  );
}

function RowB({ n, close }: { n: FakeNotification; close: () => void }) {
  const s = useNotificationsPrototype();
  const open = useOpen(n, close);
  const initials = n.actor?.split(" ").map((w) => w[0]).join("") ?? "C";
  return (
    <div className="group relative flex gap-3 px-5 py-3 hover:bg-accent">
      <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold", n.actor ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
        {initials}
      </div>
      <button onClick={open} className="min-w-0 flex-1 text-left">
        <div className="text-sm">
          <span className={cn(!n.read && "font-semibold")}>{n.title}</span>
          <span className="ml-2 text-xs text-muted-foreground">{n.ago}</span>
        </div>
        <div className="text-sm text-muted-foreground">{n.body}</div>
      </button>
      <button onClick={() => s.toggleRead(n.id)} title={n.read ? "Mark unread" : "Mark read"} className="self-center rounded-full p-1">
        <span className={cn("block size-2.5 rounded-full", n.read ? "border border-muted-foreground/40 opacity-0 group-hover:opacity-100" : "bg-blue-600")} />
      </button>
    </div>
  );
}

function PreferencesB() {
  const s = useNotificationsPrototype();
  const [explainFor, setExplainFor] = useState<NotificationType | null>(null);
  const groups = [...new Set(s.types.map((t) => CATALOGUE[t].group))];
  const anyMute = s.mute.all || CHANNELS.some((c) => s.mute[c.key]);

  const toggle = (t: NotificationType, c: Channel) => {
    const next = !s.prefs[t][c];
    if (c === "browser" && next && s.browserPermission === "default") return setExplainFor(t);
    s.setPref(t, c, next);
  };

  return (
    <div className="mt-8 max-w-2xl space-y-4" id="notifications">
      <h2 className="text-xl font-semibold">Notification Preferences</h2>
      <Card className={cn(anyMute && "border-amber-400")}>
        <CardContent className="space-y-3 pt-6">
          <div className="flex items-center gap-3">
            <BellOff className="size-5 text-muted-foreground" />
            <div className="flex-1">
              <div className="font-medium">Mute all Notifications</div>
              <div className="text-xs text-muted-foreground">Your choices below are kept and come back when you unmute.</div>
            </div>
            <Switch on={s.mute.all} onChange={(v) => s.setMute("all", v)} />
          </div>
          <div className="flex gap-4 border-t pt-3 text-sm">
            {CHANNELS.map((c) => (
              <label key={c.key} className="flex items-center gap-2 text-muted-foreground">
                <Switch on={s.mute[c.key]} onChange={(v) => s.setMute(c.key, v)} disabled={s.mute.all} />
                Mute {c.label}
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {groups.map((g) => (
        <Card key={g} className={cn(s.mute.all && "opacity-60")}>
          <CardHeader className="pb-0">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{g}</h3>
          </CardHeader>
          <CardContent className="divide-y">
            {s.types
              .filter((t) => CATALOGUE[t].group === g)
              .map((t) => (
                <div key={t} className="flex items-center gap-4 py-3">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{CATALOGUE[t].label}</div>
                    <div className="text-xs text-muted-foreground">{CATALOGUE[t].description}</div>
                  </div>
                  <div className="flex gap-1.5">
                    {CHANNELS.map((c) => {
                      const Icon = CHANNEL_ICON[c.key];
                      const locked = s.isLocked(t, c.key);
                      const on = locked || (s.prefs[t][c.key] && (c.key !== "browser" || s.browserPermission === "granted"));
                      const muted = !locked && (s.mute.all || s.mute[c.key]);
                      return (
                        <button
                          key={c.key}
                          disabled={locked || (c.key === "browser" && s.browserPermission === "denied")}
                          onClick={() => toggle(t, c.key)}
                          title={locked ? LOCK_HINT : c.key === "browser" && s.browserPermission === "denied" ? "Blocked by your browser" : undefined}
                          className={cn(
                            "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed",
                            on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
                            muted && "line-through opacity-50"
                          )}
                        >
                          {locked ? <Lock className="size-3" /> : <Icon className="size-3" />}
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      ))}

      {explainFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-96 rounded-xl bg-background p-6 shadow-2xl">
            <Monitor className="mb-3 size-8 text-primary" />
            <h3 className="mb-1 text-lg font-semibold">Get Browser Notifications?</h3>
            <p className="mb-4 text-sm text-muted-foreground">
              We'll pop up “{CATALOGUE[explainFor].label}” on this device even when Cadence isn't open. Your browser will ask you to allow it next. You can switch it off here anytime.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setExplainFor(null)}>
                Not now
              </Button>
              <Button
                onClick={async () => {
                  const t = explainFor;
                  setExplainFor(null);
                  if ((await s.requestBrowserPermission()) === "granted") s.setPref(t, "browser", true);
                }}
              >
                Continue
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ======================================================================
// Variant C — Top bar + two-pane inbox + channel-first preferences
// ======================================================================

function TopBarC() {
  const s = useNotificationsPrototype();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [filter, setFilter] = useState<string>("All");
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const navigate = useNavigate();
  const groups = ["All", ...new Set(s.notifications.map((n) => CATALOGUE[n.type].group))];
  const list = s.notifications.filter((n) => filter === "All" || CATALOGUE[n.type].group === filter);
  const sel = s.notifications.find((n) => n.id === selected) ?? null;

  return (
    <div className="sticky top-0 z-30 flex h-12 items-center justify-end gap-2 border-b bg-background/95 px-6 backdrop-blur">
      <button onClick={() => setOpen((o) => !o)} className={cn("relative flex items-center gap-2 rounded-full border px-3 py-1 text-sm", open ? "bg-accent" : "hover:bg-accent")}>
        <Bell className="size-4" />
        {s.unread > 0 ? `${s.unread} new` : "Inbox"}
        {s.unread > 0 && <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-red-600 ring-2 ring-background" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-6 top-12 z-40 flex h-[32rem] w-[46rem] overflow-hidden rounded-b-xl border bg-background shadow-2xl">
            <div className="flex w-80 shrink-0 flex-col border-r">
              {s.browserPermission === "default" && !bannerDismissed && s.notifications.length > 0 && (
                <div className="flex items-start gap-2 border-b bg-primary/10 p-3 text-xs">
                  <Monitor className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div className="flex-1">
                    Get these on your desktop too, even with Cadence closed.
                    <div className="mt-1.5 flex gap-2">
                      <button className="font-medium text-primary underline" onClick={() => s.requestBrowserPermission()}>
                        Turn on Browser Notifications
                      </button>
                      <button className="text-muted-foreground" onClick={() => setBannerDismissed(true)}>
                        Not now
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-1 border-b p-2">
                {groups.map((g) => (
                  <button key={g} onClick={() => setFilter(g)} className={cn("rounded px-2 py-0.5 text-xs", filter === g ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent")}>
                    {g}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto">
                {list.map((n) => {
                  const Icon = ICON[n.type];
                  return (
                    <button
                      key={n.id}
                      onClick={() => {
                        setSelected(n.id);
                        s.markRead(n.id);
                      }}
                      className={cn("flex w-full gap-2 border-l-2 px-3 py-2.5 text-left", selected === n.id ? "border-primary bg-accent" : "border-transparent hover:bg-accent/50")}
                    >
                      <Icon className={cn("mt-0.5 size-4 shrink-0", n.read ? "text-muted-foreground" : "text-primary")} />
                      <div className="min-w-0 flex-1">
                        <div className={cn("truncate text-sm", !n.read && "font-semibold")}>{n.title}</div>
                        <div className="truncate text-xs text-muted-foreground">{n.body}</div>
                      </div>
                      <span className="text-[11px] text-muted-foreground">{n.ago}</span>
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-between border-t px-3 py-2 text-xs text-muted-foreground">
                <button onClick={s.markAllRead} disabled={s.unread === 0} className="hover:underline disabled:opacity-40">
                  Mark all read
                </button>
                <Link to="/settings?variant=C#notifications" onClick={() => setOpen(false)} className="hover:underline">
                  Preferences
                </Link>
              </div>
            </div>
            <div className="flex flex-1 flex-col p-6">
              {s.notifications.length === 0 ? (
                <EmptyC />
              ) : !sel ? (
                <div className="m-auto text-sm text-muted-foreground">Select a Notification</div>
              ) : (
                <>
                  <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">{CATALOGUE[sel.type].label} · {sel.ago} ago</div>
                  <h3 className="mb-3 text-xl font-semibold">{sel.title}</h3>
                  <p className="mb-6 text-sm">{sel.body}</p>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        setOpen(false);
                        navigate(sel.href);
                      }}
                    >
                      Open
                    </Button>
                    <Button variant="outline" onClick={() => s.toggleRead(sel.id)}>
                      Mark {sel.read ? "unread" : "read"}
                    </Button>
                  </div>
                  <button
                    className="mt-auto self-start text-xs text-muted-foreground hover:underline"
                    onClick={() => s.setPref(sel.type, "inApp", false)}
                    disabled={!s.prefs[sel.type].inApp}
                  >
                    {s.prefs[sel.type].inApp ? `Stop showing “${CATALOGUE[sel.type].label}” here` : "Turned off in-app ✓"}
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function EmptyC() {
  const s = useNotificationsPrototype();
  return (
    <div className="m-auto max-w-xs text-center text-sm text-muted-foreground">
      <Bell className="mx-auto mb-3 size-10 opacity-30" />
      <div className="mb-2 font-medium text-foreground">Your inbox is empty</div>
      You'll hear here about:
      <ul className="mt-2 space-y-1 text-left">
        {s.types.map((t) => (
          <li key={t}>· {CATALOGUE[t].label}</li>
        ))}
      </ul>
    </div>
  );
}

function PreferencesC() {
  const s = useNotificationsPrototype();
  return (
    <div className="mt-8 max-w-5xl" id="notifications">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h2 className="text-xl font-semibold">Notification Preferences</h2>
          <p className="text-sm text-muted-foreground">Pick a Channel, then what reaches you there.</p>
        </div>
        <Button variant={s.mute.all ? "default" : "outline"} onClick={() => s.setMute("all", !s.mute.all)}>
          {s.mute.all ? <><Bell className="size-4" /> Unmute everything</> : <><BellOff className="size-4" /> Mute everything</>}
        </Button>
      </div>
      {s.mute.all && (
        <div className="mb-4 rounded-md border border-amber-400 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          Everything is muted except receipts and Refund Request emails. Your choices are kept.
        </div>
      )}
      <div className="grid grid-cols-3 gap-4">
        {CHANNELS.map((c) => {
          const Icon = CHANNEL_ICON[c.key];
          const browserBlocked = c.key === "browser" && s.browserPermission !== "granted";
          const channelOn = !s.mute[c.key] && !s.mute.all;
          return (
            <Card key={c.key} className={cn(!channelOn && "opacity-70")}>
              <CardHeader className="flex-row items-center gap-2 border-b pb-3">
                <Icon className="size-5" />
                <span className="flex-1 font-semibold">{c.label}</span>
                <Switch on={!s.mute[c.key]} onChange={(v) => s.setMute(c.key, !v)} disabled={s.mute.all || browserBlocked} />
              </CardHeader>
              <CardContent className="pt-3">
                {browserBlocked ? (
                  <div className="py-6 text-center text-sm">
                    {s.browserPermission === "denied" ? (
                      <p className="text-red-600">Blocked by this browser. Allow Notifications for Cadence in site settings, then reload.</p>
                    ) : (
                      <>
                        <p className="mb-3 text-muted-foreground">Pop-ups on this device, even when Cadence is closed.</p>
                        <Button size="sm" onClick={() => s.requestBrowserPermission()}>
                          Enable on this device
                        </Button>
                      </>
                    )}
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {s.types.map((t) => {
                      const locked = s.isLocked(t, c.key);
                      return (
                        <li key={t}>
                          <label className={cn("flex items-start gap-2 text-sm", locked && "cursor-not-allowed")}>
                            {locked ? (
                              <Lock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                            ) : (
                              <input type="checkbox" className="mt-1" checked={s.prefs[t][c.key]} onChange={(e) => s.setPref(t, c.key, e.target.checked)} />
                            )}
                            <span className={cn(locked && "text-muted-foreground")}>
                              {CATALOGUE[t].label}
                              {locked && <span className="block text-[11px]">Always sent</span>}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ======================================================================
// Slots mounted by the real layout / settings page
// ======================================================================

export function SidebarHeaderSlot() {
  const [v] = usePrototypeVariant();
  return v === "A" ? <BellA /> : null;
}

export function SidebarNavSlot() {
  const [v] = usePrototypeVariant();
  return v === "B" ? <NavB /> : null;
}

export function MainTopSlot() {
  const [v] = usePrototypeVariant();
  return v === "C" ? <TopBarC /> : null;
}

export function NotificationPreferencesPrototype() {
  const [v] = usePrototypeVariant();
  if (v === "B") return <PreferencesB />;
  if (v === "C") return <PreferencesC />;
  return <PreferencesA />;
}

