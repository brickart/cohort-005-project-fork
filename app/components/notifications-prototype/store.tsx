// PROTOTYPE — throwaway. Answers "What do Notifications look like in the app?"
// (wayfinder ticket #9). Fake data, in-memory state, no persistence, no service.
// Lives on branch prototype/notifications-ui; never merge to main.

import { createContext, useContext, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { UserRole } from "~/db/schema";

export type Channel = "email" | "inApp" | "browser";
export const CHANNELS: { key: Channel; label: string }[] = [
  { key: "email", label: "Email" },
  { key: "inApp", label: "In-app" },
  { key: "browser", label: "Browser" },
];

export type NotificationType =
  | "refundRaisedConfirmation"
  | "refundRaisedToDecide"
  | "refundApproved"
  | "refundDeclined"
  | "purchaseReceipt"
  | "lessonQuestion"
  | "commentReply"
  | "newEnrollment"
  | "couponRedeemed"
  | "courseStatus";

export interface CatalogueEntry {
  type: NotificationType;
  label: string;
  description: string;
  group: "Refunds & purchases" | "Teaching" | "Conversations" | "Team";
  defaults: Record<Channel, boolean>;
  lockedEmail: boolean;
}

const EMAIL_INAPP = { email: true, inApp: true, browser: false };

export const CATALOGUE: Record<NotificationType, CatalogueEntry> = {
  refundRaisedConfirmation: {
    type: "refundRaisedConfirmation",
    label: "Refund Request received",
    description: "Confirmation when you raise a Refund Request",
    group: "Refunds & purchases",
    defaults: EMAIL_INAPP,
    lockedEmail: true,
  },
  refundApproved: {
    type: "refundApproved",
    label: "Refund Request approved",
    description: "When an Admin approves your Refund Request",
    group: "Refunds & purchases",
    defaults: EMAIL_INAPP,
    lockedEmail: true,
  },
  refundDeclined: {
    type: "refundDeclined",
    label: "Refund Request declined",
    description: "When an Admin declines your Refund Request",
    group: "Refunds & purchases",
    defaults: EMAIL_INAPP,
    lockedEmail: true,
  },
  purchaseReceipt: {
    type: "purchaseReceipt",
    label: "Purchase receipt",
    description: "When a purchase completes",
    group: "Refunds & purchases",
    defaults: EMAIL_INAPP,
    lockedEmail: true,
  },
  refundRaisedToDecide: {
    type: "refundRaisedToDecide",
    label: "Refund Request to decide",
    description: "When a Learner raises a Refund Request",
    group: "Refunds & purchases",
    defaults: EMAIL_INAPP,
    lockedEmail: false,
  },
  lessonQuestion: {
    type: "lessonQuestion",
    label: "New question on a lesson",
    description: "When someone asks a question on one of your lessons",
    group: "Teaching",
    defaults: EMAIL_INAPP,
    lockedEmail: false,
  },
  newEnrollment: {
    type: "newEnrollment",
    label: "New Enrollment",
    description: "When a Learner enrolls in your course",
    group: "Teaching",
    defaults: { email: false, inApp: true, browser: false },
    lockedEmail: false,
  },
  courseStatus: {
    type: "courseStatus",
    label: "Course published / archived",
    description: "When an Admin changes your course's status",
    group: "Teaching",
    defaults: EMAIL_INAPP,
    lockedEmail: false,
  },
  commentReply: {
    type: "commentReply",
    label: "Reply to your comment",
    description: "When someone replies to a comment you wrote",
    group: "Conversations",
    defaults: EMAIL_INAPP,
    lockedEmail: false,
  },
  couponRedeemed: {
    type: "couponRedeemed",
    label: "Coupon redeemed",
    description: "When a team member redeems one of your codes",
    group: "Team",
    defaults: EMAIL_INAPP,
    lockedEmail: false,
  },
};

export function typesForRole(
  role: UserRole | null,
  isTeamManager: boolean
): NotificationType[] {
  if (role === UserRole.Instructor)
    return ["lessonQuestion", "newEnrollment", "courseStatus", "commentReply"];
  if (role === UserRole.Admin)
    return ["refundRaisedToDecide", "commentReply"];
  const learner: NotificationType[] = [
    "refundRaisedConfirmation",
    "refundApproved",
    "refundDeclined",
    "purchaseReceipt",
    "commentReply",
  ];
  return isTeamManager ? [...learner, "couponRedeemed"] : learner;
}

export interface FakeNotification {
  id: number;
  type: NotificationType;
  title: string;
  body: string;
  href: string;
  ago: string;
  bucket: "Today" | "This week" | "Earlier";
  actor?: string;
  read: boolean;
}

const TS = "/courses/introduction-to-typescript";
const API = "/courses/building-rest-apis-with-nodejs";

function seed(role: UserRole | null, isTeamManager: boolean): FakeNotification[] {
  let list: Omit<FakeNotification, "id">[];
  if (role === UserRole.Instructor) {
    list = [
      { type: "lessonQuestion", actor: "Emma Wilson", title: "Emma Wilson asked a question", body: "“Why does `as const` narrow the tuple here?” on Literal Types", href: `${TS}/lessons/3`, ago: "12m", bucket: "Today", read: false },
      { type: "newEnrollment", actor: "James Park", title: "James Park enrolled", body: "Introduction to TypeScript", href: "/instructor/1/students", ago: "1h", bucket: "Today", read: false },
      { type: "commentReply", actor: "Olivia Martinez", title: "Olivia Martinez replied to you", body: "“Thanks, that fixed it!” on Generics", href: `${TS}/lessons/5`, ago: "3h", bucket: "Today", read: false },
      { type: "courseStatus", actor: "Bossy McBossface", title: "Course published", body: "Building REST APIs with Node.js is now live", href: "/instructor/2", ago: "2d", bucket: "This week", read: true },
      { type: "newEnrollment", actor: "Liam Thompson", title: "Liam Thompson enrolled", body: "Building REST APIs with Node.js", href: "/instructor/2/students", ago: "3d", bucket: "This week", read: true },
      { type: "lessonQuestion", actor: "Sophia Davis", title: "Sophia Davis asked a question", body: "“Is Express still the default in 2026?” on Routing", href: `${API}/lessons/12`, ago: "2w", bucket: "Earlier", read: true },
    ];
  } else if (role === UserRole.Admin) {
    list = [
      { type: "refundRaisedToDecide", actor: "Emma Wilson", title: "Refund Request to decide", body: "Emma Wilson · Introduction to TypeScript · $49.00 · “Course wasn't what I expected”", href: "/admin/courses", ago: "25m", bucket: "Today", read: false },
      { type: "refundRaisedToDecide", actor: "Liam Thompson", title: "Refund Request to decide", body: "Liam Thompson · Building REST APIs with Node.js · $79.00", href: "/admin/courses", ago: "5h", bucket: "Today", read: false },
      { type: "commentReply", actor: "Sarah Chen", title: "Sarah Chen replied to you", body: "“Agreed, I'll update the module.” on Docker Basics", href: "/courses/shipping-with-docker-and-kubernetes", ago: "4d", bucket: "This week", read: true },
    ];
  } else {
    list = [
      { type: "refundApproved", title: "Refund Request approved", body: "Your $49.00 refund for Introduction to TypeScript is on its way", href: "/settings", ago: "8m", bucket: "Today", read: false },
      { type: "commentReply", actor: "Sarah Chen", title: "Sarah Chen replied to you", body: "“Good catch — use `satisfies` instead.” on Literal Types", href: `${TS}/lessons/3`, ago: "2h", bucket: "Today", read: false },
      ...(isTeamManager
        ? [{ type: "couponRedeemed" as const, actor: "James Park", title: "James Park redeemed a coupon", body: "Design Systems with Tailwind · 3 of 5 codes used", href: "/team", ago: "6h", bucket: "Today" as const, read: false }]
        : []),
      { type: "purchaseReceipt", title: "Purchase confirmed", body: "Building REST APIs with Node.js · $79.00", href: API, ago: "3d", bucket: "This week", read: true },
      { type: "refundRaisedConfirmation", title: "Refund Request received", body: "We're reviewing your request for Introduction to TypeScript", href: "/settings", ago: "4d", bucket: "This week", read: true },
      { type: "purchaseReceipt", title: "Purchase confirmed", body: "Introduction to TypeScript · $49.00", href: TS, ago: "3w", bucket: "Earlier", read: true },
    ];
  }
  return list.map((n, i) => ({ ...n, id: i + 1 }));
}

export type Prefs = Record<NotificationType, Record<Channel, boolean>>;
export type BrowserPermission = "default" | "granted" | "denied";

function defaultPrefs(): Prefs {
  const p = {} as Prefs;
  for (const e of Object.values(CATALOGUE)) p[e.type] = { ...e.defaults };
  return p;
}

interface Store {
  role: UserRole | null;
  isTeamManager: boolean;
  types: NotificationType[];
  notifications: FakeNotification[];
  unread: number;
  markRead: (id: number) => void;
  markAllRead: () => void;
  toggleRead: (id: number) => void;
  clearAll: () => void;
  reseed: () => void;
  prefs: Prefs;
  setPref: (t: NotificationType, c: Channel, v: boolean) => void;
  mute: { all: boolean } & Record<Channel, boolean>;
  setMute: (k: "all" | Channel, v: boolean) => void;
  browserPermission: BrowserPermission;
  setBrowserPermission: (p: BrowserPermission) => void;
  /** Simulated native browser prompt; resolves with the user's pick. */
  requestBrowserPermission: () => Promise<BrowserPermission>;
  pendingPrompt: ((p: BrowserPermission) => void) | null;
  /** Would this Notification actually be delivered on this Channel? */
  delivers: (t: NotificationType, c: Channel) => boolean;
  isLocked: (t: NotificationType, c: Channel) => boolean;
}

const Ctx = createContext<Store | null>(null);

export function NotificationsPrototypeProvider({
  role,
  isTeamManager,
  userId,
  children,
}: {
  role: UserRole | null;
  isTeamManager: boolean;
  userId: number | null;
  children: React.ReactNode;
}) {
  const [notifications, setNotifications] = useState(() => seed(role, isTeamManager));
  const [prefs, setPrefs] = useState(defaultPrefs);
  const [mute, setMuteState] = useState({ all: false, email: false, inApp: false, browser: false });
  const [browserPermission, setBrowserPermission] = useState<BrowserPermission>("default");
  const [pendingPrompt, setPendingPrompt] = useState<((p: BrowserPermission) => void) | null>(null);

  // Reset everything when the DevUI switches user.
  useEffect(() => {
    setNotifications(seed(role, isTeamManager));
    setPrefs(defaultPrefs());
    setMuteState({ all: false, email: false, inApp: false, browser: false });
  }, [userId, role, isTeamManager]);

  const isLocked = (t: NotificationType, c: Channel) =>
    c === "email" && CATALOGUE[t].lockedEmail;

  const store: Store = {
    role,
    isTeamManager,
    types: typesForRole(role, isTeamManager),
    notifications,
    unread: notifications.filter((n) => !n.read).length,
    markRead: (id) =>
      setNotifications((ns) => ns.map((n) => (n.id === id ? { ...n, read: true } : n))),
    toggleRead: (id) =>
      setNotifications((ns) => ns.map((n) => (n.id === id ? { ...n, read: !n.read } : n))),
    markAllRead: () => setNotifications((ns) => ns.map((n) => ({ ...n, read: true }))),
    clearAll: () => setNotifications([]),
    reseed: () => setNotifications(seed(role, isTeamManager)),
    prefs,
    setPref: (t, c, v) => setPrefs((p) => ({ ...p, [t]: { ...p[t], [c]: v } })),
    mute,
    setMute: (k, v) => setMuteState((m) => ({ ...m, [k]: v })),
    browserPermission,
    setBrowserPermission,
    requestBrowserPermission: () =>
      new Promise<BrowserPermission>((resolve) => {
        if (browserPermission !== "default") return resolve(browserPermission);
        setPendingPrompt(() => (p: BrowserPermission) => {
          setBrowserPermission(p);
          setPendingPrompt(null);
          resolve(p);
        });
      }),
    pendingPrompt,
    isLocked,
    delivers: (t, c) => {
      if (isLocked(t, c)) return true;
      if (mute.all || mute[c]) return false;
      if (c === "browser" && browserPermission !== "granted") return false;
      return prefs[t][c];
    },
  };

  return (
    <Ctx.Provider value={store}>
      {children}
      {pendingPrompt && <FakeNativePrompt onPick={pendingPrompt} />}
    </Ctx.Provider>
  );
}

export function useNotificationsPrototype() {
  const s = useContext(Ctx);
  if (!s) throw new Error("NotificationsPrototypeProvider missing");
  return s;
}

/** Mimics the browser's own permission bubble (top-left, under the URL bar). */
function FakeNativePrompt({ onPick }: { onPick: (p: BrowserPermission) => void }) {
  return (
    <div className="fixed left-4 top-2 z-[100] w-80 rounded-lg border border-zinc-300 bg-white p-4 text-sm text-zinc-900 shadow-2xl">
      <div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">
        Simulated browser prompt · localhost:5173
      </div>
      <div className="mb-3 font-medium">localhost:5173 wants to show notifications</div>
      <div className="flex justify-end gap-2">
        <button className="rounded border px-3 py-1" onClick={() => onPick("denied")}>
          Block
        </button>
        <button className="rounded bg-blue-600 px-3 py-1 text-white" onClick={() => onPick("granted")}>
          Allow
        </button>
      </div>
    </div>
  );
}

// ---- variant selection -------------------------------------------------

export const VARIANTS = [
  { key: "A", name: "Popover + grid" },
  { key: "B", name: "Drawer + grouped cards" },
  { key: "C", name: "Inbox panel + channel-first" },
] as const;
export type VariantKey = (typeof VARIANTS)[number]["key"];

const LS_KEY = "cadence-notifications-prototype-variant";

/** ?variant= wins; otherwise the last pick (so sidebar links that drop the param keep it). */
export function usePrototypeVariant(): [VariantKey, (v: VariantKey) => void] {
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get("variant") as VariantKey | null;
  const [remembered, setRemembered] = useState<VariantKey>("A");
  useEffect(() => {
    const v = localStorage.getItem(LS_KEY) as VariantKey | null;
    if (v) setRemembered(v);
  }, []);
  const current = fromUrl && VARIANTS.some((v) => v.key === fromUrl) ? fromUrl : remembered;
  const set = (v: VariantKey) => {
    localStorage.setItem(LS_KEY, v);
    setRemembered(v);
    setParams(
      (p) => {
        p.set("variant", v);
        return p;
      },
      { replace: true, preventScrollReset: true }
    );
  };
  return [current, set];
}
