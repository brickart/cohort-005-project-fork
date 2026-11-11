import { UserRole } from "~/db/schema";

// ─── The Notification catalogue ───
// Every kind of Notification Cadence sends, keyed by catalogue key. The key is
// also the Knock workflow key, so each entry has a matching directory under
// .knock/workflows/. The catalogue lives in code, not in the database.
//
// Adding a Notification: add its data type to NotificationDataMap, an entry to
// NOTIFICATIONS, a workflow under .knock/workflows/<key>/, fixture data in
// catalogue.test.ts, and an enqueueNotifications call in the domain function
// that causes it.

export type Channel = "email" | "in_app_feed";

/** What every Notification's `data` snapshot carries. */
export type BaseNotificationData = {
  /** Who it is for. Knock identifies the recipient inline from these. */
  recipient: { email: string; name: string };
  /** The display name of whoever caused it, or null for system events. */
  actor_name: string | null;
  /** The In-app title. Knock's In-app template has no title field. */
  title: string;
  /** Relative path the In-app Notification links to. */
  action_url: string;
  /** Absolute link to Notification Preferences, for the Email footer. */
  preferences_url: string;
};

export type RefundRequestRaisedData = BaseNotificationData & {
  course_title: string;
  /** The amount paid, already formatted, e.g. "$79.00". */
  amount: string;
  /** Absolute link to where the buyer follows their Refund Request. */
  refund_url: string;
};

export type RefundRequestToDecideData = BaseNotificationData & {
  course_title: string;
  amount: string;
  buyer_name: string;
  reason: string;
  /** Absolute link to the Admin refund queue. */
  refunds_url: string;
};

/**
 * What an approved Refund Request ended:
 * - `enrollment_ended`: the buyer's place on the course.
 * - `enrollment_kept`: nothing, because the buyer also holds a Claimed Seat.
 * - `seats_cancelled`: a Team Licence's Unclaimed Seats.
 */
export type RefundOutcome =
  | "enrollment_ended"
  | "enrollment_kept"
  | "seats_cancelled";

export type RefundRequestApprovedData = BaseNotificationData & {
  course_title: string;
  /** The amount refunded, already formatted. */
  amount: string;
  /** The Admin's optional note to the buyer. */
  note: string | null;
  outcome: RefundOutcome;
  refund_url: string;
};

export type RefundRequestDeclinedData = BaseNotificationData & {
  course_title: string;
  amount: string;
  /** Why the Admin declined it. Always given. */
  reason: string;
  refund_url: string;
};

/** What lesson-question and comment-reply carry. */
export type LessonCommentData = BaseNotificationData & {
  course_title: string;
  lesson_title: string;
  /** The start of the comment, as the commenter wrote it (untrusted). */
  comment_excerpt: string;
  /** Absolute link to the lesson the comment is on. */
  lesson_url: string;
};

export type CourseStatusChangedData = BaseNotificationData & {
  course_title: string;
  /** The course's new status: "published" or "archived". */
  status: "published" | "archived";
  /** Absolute link to the course in the Instructor's editor. */
  course_url: string;
};

export type NotificationDataMap = {
  "refund-request-raised": RefundRequestRaisedData;
  "refund-request-to-decide": RefundRequestToDecideData;
  "refund-request-approved": RefundRequestApprovedData;
  "refund-request-declined": RefundRequestDeclinedData;
  "lesson-question": LessonCommentData;
  "comment-reply": LessonCommentData;
  "course-status-changed": CourseStatusChangedData;
};

export type NotificationKey = keyof NotificationDataMap;

export type CatalogueEntry = {
  /** Shown in Notification Preferences. */
  label: string;
  /**
   * A Locked Notification ignores Mute and Notification Preferences on every
   * Channel: its Knock workflow has "Override recipient preferences" on.
   */
  locked: boolean;
  /** The Channels it goes out on unless the recipient turns them off. */
  channels: readonly Channel[];
  /** The roles that can receive it, for Notification Preferences. */
  recipientRoles: readonly UserRole[];
  /** A lucide-react icon name for the feed. */
  icon: string;
};

export const NOTIFICATIONS = {
  "refund-request-raised": {
    label: "Refund Request received",
    locked: true,
    channels: ["email", "in_app_feed"],
    recipientRoles: [UserRole.Student, UserRole.Instructor, UserRole.Admin],
    icon: "receipt",
  },
  "refund-request-to-decide": {
    label: "Refund Request to decide",
    locked: false,
    channels: ["email", "in_app_feed"],
    recipientRoles: [UserRole.Admin],
    icon: "inbox",
  },
  "refund-request-approved": {
    label: "Refund Request approved",
    locked: true,
    channels: ["email", "in_app_feed"],
    recipientRoles: [UserRole.Student, UserRole.Instructor, UserRole.Admin],
    icon: "circle-check",
  },
  "refund-request-declined": {
    label: "Refund Request declined",
    locked: true,
    channels: ["email", "in_app_feed"],
    recipientRoles: [UserRole.Student, UserRole.Instructor, UserRole.Admin],
    icon: "circle-x",
  },
  "lesson-question": {
    label: "New question on your lesson",
    locked: false,
    channels: ["email", "in_app_feed"],
    recipientRoles: [UserRole.Instructor],
    icon: "message-circle-question",
  },
  "comment-reply": {
    label: "Reply to your comment",
    locked: false,
    channels: ["email", "in_app_feed"],
    recipientRoles: [UserRole.Student, UserRole.Instructor, UserRole.Admin],
    icon: "message-square-reply",
  },
  "course-status-changed": {
    label: "Course status changed",
    locked: false,
    channels: ["email", "in_app_feed"],
    recipientRoles: [UserRole.Instructor],
    icon: "book-open",
  },
} satisfies Record<NotificationKey, CatalogueEntry>;

export const NOTIFICATION_KEYS = Object.keys(
  NOTIFICATIONS
) as NotificationKey[];

export function isNotificationKey(key: string): key is NotificationKey {
  return Object.hasOwn(NOTIFICATIONS, key);
}

export function getCatalogueEntry(key: NotificationKey): CatalogueEntry {
  return NOTIFICATIONS[key];
}
