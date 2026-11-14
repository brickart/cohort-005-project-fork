import { useRef, useEffect } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import type { Route } from "./+types/settings";
import { getCurrentUserId } from "~/lib/session";
import { parseFormData } from "~/lib/validation";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { UserRole, RefundStatus, users } from "~/db/schema";
import { AlertTriangle } from "lucide-react";
import { data, isRouteErrorResponse, Link } from "react-router";
import { db } from "~/db";
import { eq } from "drizzle-orm";
import { formatPrice } from "~/lib/utils";
import { listRefundRequestsForBuyer } from "~/lib/refunds.server";
import { isNotificationKey, type NotificationKey } from "~/lib/notifications/catalogue";
import {
  changePreference,
  preferenceCards,
  type PreferenceCard,
  type PreferenceRow,
} from "~/lib/notifications/preferences";
import { getNotificationService } from "~/lib/notifications/runtime.server";
import { Checkbox } from "~/components/ui/checkbox";
import { Switch } from "~/components/ui/switch";
import { BellOff, Lock } from "lucide-react";

const formBoolean = z.enum(["true", "false"]).transform((value) => value === "true");
const channelSchema = z.enum(["email", "in_app_feed"]);

const settingsSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("profile"),
    name: z.string().trim().min(1, "Name cannot be empty."),
    bio: z.string().trim().optional(),
  }),
  z.object({
    intent: z.literal("notification"),
    type: z.custom<NotificationKey>(
      (value) => typeof value === "string" && isNotificationKey(value),
      "Unknown Notification."
    ),
    channel: channelSchema,
    enabled: formBoolean,
  }),
  z.object({
    intent: z.literal("mute-channel"),
    channel: channelSchema,
    muted: formBoolean,
  }),
  z.object({
    intent: z.literal("mute-everything"),
    muted: formBoolean,
  }),
]);

export function meta() {
  return [
    { title: "Settings — Cadence" },
    { name: "description", content: "Edit your profile details" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel to edit your details.", {
      status: 401,
    });
  }

  const currentUser = db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .get();

  if (!currentUser) {
    throw data("User not found.", { status: 404 });
  }

  const refundRequests = listRefundRequestsForBuyer(db, currentUserId);
  const preferences =
    await getNotificationService().getPreferences(currentUserId);

  return {
    notificationPreferences: {
      muteEverything: preferences.muteEverything,
      cards: preferenceCards(currentUser.role, preferences),
    },
    user: {
      id: currentUser.id,
      name: currentUser.name,
      email: currentUser.email,
      bio: currentUser.bio,
      role: currentUser.role,
    },
    refundRequests,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("You must be logged in.", { status: 401 });
  }

  const currentUser = db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .get();
  if (!currentUser) {
    throw data("User not found.", { status: 404 });
  }

  const formData = await request.formData();
  const parsed = parseFormData(formData, settingsSchema);

  if (!parsed.success) {
    return data({ errors: parsed.errors }, { status: 400 });
  }

  if (parsed.data.intent !== "profile") {
    const service = getNotificationService();
    const result = changePreference(
      await service.getPreferences(currentUser.id),
      currentUser.role,
      parsed.data
    );
    if (!result.ok) throw data(result.error, { status: result.status });
    await service.setPreferences(currentUser.id, result.preferences);
    return { preferencesSaved: true };
  }

  const { name, bio } = parsed.data;

  db
    .update(users)
    .set({ name, email: currentUser.email, bio: bio || null })
    .where(eq(users.id, currentUser.id))
    .returning()
    .get();
  return { success: true };
}

export default function Settings({ loaderData }: Route.ComponentProps) {
  const { user, refundRequests, notificationPreferences } = loaderData;
  const openCount = refundRequests.filter(
    (refundRequest) => refundRequest.status === RefundStatus.Open
  ).length;
  const fetcher = useFetcher();
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      toast.success("Profile updated successfully.");
    }
    if (fetcher.state === "idle" && fetcher.data?.errors) {
      const firstError = Object.values(fetcher.data.errors)[0] as string | undefined;
      if (firstError) toast.error(firstError);
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Home
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Settings</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Update your profile details
        </p>
      </div>

      <Card className="max-w-md">
        <CardHeader>
          <h2 className="text-lg font-semibold">Profile</h2>
        </CardHeader>
        <CardContent>
          <fetcher.Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="profile" />
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                ref={nameInputRef}
                id="name"
                name="name"
                type="text"
                defaultValue={user.name}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={user.email}
                disabled
                className="text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground">
                Email cannot be changed.
              </p>
            </div>
            {user.role === UserRole.Instructor && (
              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  name="bio"
                  rows={4}
                  defaultValue={user.bio ?? ""}
                  placeholder="Tell students about yourself..."
                />
                <p className="text-xs text-muted-foreground">
                  Your bio is shown on your course pages.
                </p>
              </div>
            )}
            <Button
              type="submit"
              disabled={fetcher.state !== "idle"}
            >
              {fetcher.state !== "idle" ? "Saving..." : "Save Changes"}
            </Button>
          </fetcher.Form>
        </CardContent>
      </Card>

      <NotificationPreferencesSection
        muteEverything={notificationPreferences.muteEverything}
        cards={notificationPreferences.cards}
      />

      {refundRequests.length > 0 && (
        <Card className="mt-8 max-w-md">
          <CardHeader>
            <h2 className="text-lg font-semibold">Refund Requests</h2>
            {openCount > 0 && (
              <p className="text-sm text-muted-foreground">
                {openCount === 1
                  ? "One refund request is waiting on us."
                  : `${openCount} refund requests are waiting on us.`}
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {refundRequests.map((refundRequest) => (
              <div key={refundRequest.id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    to={`/courses/${refundRequest.courseSlug}`}
                    className="font-medium hover:underline"
                  >
                    {refundRequest.courseTitle}
                  </Link>
                  <RefundStatusBadge status={refundRequest.status} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatPrice(refundRequest.amountPaid)} · raised{" "}
                  {new Date(refundRequest.requestedAt).toLocaleDateString()}
                  {refundRequest.resolvedAt && (
                    <>
                      {" "}
                      · decided{" "}
                      {new Date(refundRequest.resolvedAt).toLocaleDateString()}
                    </>
                  )}
                </p>
                <p className="mt-2 text-sm">{refundRequest.reason}</p>
                {refundRequest.decisionNote && (
                  <p className="mt-2 rounded-md bg-muted p-2 text-sm">
                    <span className="font-medium">Our note: </span>
                    {refundRequest.decisionNote}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Notification Preferences ───

/** While a change is in flight, show the value it is changing to. */
function usePendingValue(
  fetcher: ReturnType<typeof useFetcher>,
  field: string,
  current: boolean
): boolean {
  const pending = fetcher.formData?.get(field);
  return typeof pending === "string" ? pending === "true" : current;
}

function NotificationPreferencesSection({
  muteEverything,
  cards,
}: {
  muteEverything: boolean;
  cards: PreferenceCard[];
}) {
  const fetcher = useFetcher();
  const muted = usePendingValue(fetcher, "muted", muteEverything);

  return (
    <section className="mt-8 max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Notification Preferences</h2>
          <p className="text-sm text-muted-foreground">
            Choose which Notifications you get, and where.
          </p>
        </div>
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="mute-everything" />
          <input type="hidden" name="muted" value={String(!muted)} />
          <Button type="submit" variant={muted ? "default" : "outline"}>
            <BellOff />
            {muted ? "Unmute everything" : "Mute everything"}
          </Button>
        </fetcher.Form>
      </div>

      {muted && (
        <div
          role="status"
          className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
        >
          Everything is muted. Receipts and Refund Request emails still
          arrive. Your choices below are kept, and come back when you unmute.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((card) => (
          <ChannelCard key={card.channel} card={card} />
        ))}
      </div>
    </section>
  );
}

function ChannelCard({ card }: { card: PreferenceCard }) {
  const fetcher = useFetcher();
  const muted = usePendingValue(fetcher, "muted", card.muted);
  const switchId = `mute-${card.channel}`;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <h3 className="font-semibold">{card.title}</h3>
        <div className="flex items-center gap-2">
          <Label htmlFor={switchId} className="text-sm text-muted-foreground">
            Mute
          </Label>
          <Switch
            id={switchId}
            checked={muted}
            onCheckedChange={(checked) =>
              fetcher.submit(
                {
                  intent: "mute-channel",
                  channel: card.channel,
                  muted: String(checked),
                },
                { method: "post" }
              )
            }
          />
        </div>
      </CardHeader>
      <CardContent className={muted ? "opacity-60" : undefined}>
        <ul className="space-y-3">
          {card.rows.map((row) => (
            <PreferenceRowItem
              key={row.key}
              row={row}
              channel={card.channel}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function PreferenceRowItem({
  row,
  channel,
}: {
  row: PreferenceRow;
  channel: PreferenceCard["channel"];
}) {
  const fetcher = useFetcher();
  const enabled = usePendingValue(fetcher, "enabled", row.enabled);
  const id = `${channel}-${row.key}`;

  if (row.locked) {
    return (
      <li className="flex items-center justify-between gap-3 text-sm">
        <span>{row.label}</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Lock className="size-3.5" />
          Always sent
        </span>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <Label htmlFor={id} className="font-normal">
        {row.label}
      </Label>
      <Checkbox
        id={id}
        checked={enabled}
        onCheckedChange={(checked) =>
          fetcher.submit(
            {
              intent: "notification",
              type: row.key,
              channel,
              enabled: String(checked === true),
            },
            { method: "post" }
          )
        }
      />
    </li>
  );
}

const REFUND_STATUS_BADGES: Record<
  RefundStatus,
  { label: string; className: string }
> = {
  [RefundStatus.Open]: {
    label: "Open",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  },
  [RefundStatus.Approved]: {
    label: "Approved",
    className:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  },
  [RefundStatus.Declined]: {
    label: "Declined",
    className: "bg-muted text-muted-foreground",
  },
};

function RefundStatusBadge({ status }: { status: RefundStatus }) {
  const badge = REFUND_STATUS_BADGES[status];
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
    >
      {badge.label}
    </span>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      title = "Sign in required";
      message =
        typeof error.data === "string"
          ? error.data
          : "Please select a user from the DevUI panel.";
    } else if (error.status === 404) {
      title = "User not found";
      message =
        typeof error.data === "string" ? error.data : "User not found.";
    } else {
      title = `Error ${error.status}`;
      message =
        typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/">
            <Button>Go Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
