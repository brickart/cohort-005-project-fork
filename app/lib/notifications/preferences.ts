import type { UserRole } from "~/db/schema";
import {
  isNotificationKey,
  NOTIFICATION_KEYS,
  NOTIFICATIONS,
  type CatalogueEntry,
  type Channel,
  type NotificationKey,
} from "./catalogue";

// ─── Notification Preferences ───
// A person's choices of which Notifications they get on which Channel, plus
// Mute. Everything not locked is on by default. Mute never changes the choices
// underneath, so unmuting restores them.
//
// They are kept the way Knock keeps them (a PreferenceSet), so the local
// NotificationService and Knock decide delivery the same way:
// - a per-Notification choice is workflows.<key>.channel_types.<channel>
// - Channel Mute is the top-level channel_types.<channel> set to false
// - Mute everything sets the shared MUTE_CATEGORY, which every non-locked
//   workflow carries, to false
// A Notification goes out on a Channel only if every applicable preference is
// true, and a Locked Notification ignores all of them.

export const CHANNELS: readonly Channel[] = ["email", "in_app_feed"];

/** The Knock category every non-locked workflow carries, for Mute everything. */
export const MUTE_CATEGORY = "cadence";

export type ChannelChoices = Partial<Record<Channel, boolean>>;

export type NotificationPreferences = {
  muteEverything: boolean;
  /** true = that whole Channel is muted. */
  mutedChannels: Record<Channel, boolean>;
  /** Per Notification and Channel. Missing means on. */
  notifications: { [K in NotificationKey]?: ChannelChoices };
};

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  muteEverything: false,
  mutedChannels: { email: false, in_app_feed: false },
  notifications: {},
};

// ─── What /settings shows ───

export type PreferenceRow = {
  key: NotificationKey;
  label: string;
  /** A Locked Notification is always sent and cannot be changed. */
  locked: boolean;
  /** The choice underneath any Mute. Always true when locked. */
  enabled: boolean;
};

export type PreferenceCard = {
  channel: Channel;
  title: string;
  muted: boolean;
  rows: PreferenceRow[];
};

const CHANNEL_TITLES: Record<Channel, string> = {
  email: "Email",
  in_app_feed: "In-app",
};

function receives(role: UserRole, key: NotificationKey, channel: Channel) {
  const entry: CatalogueEntry = NOTIFICATIONS[key];
  return entry.recipientRoles.includes(role) && entry.channels.includes(channel);
}

/** One card per Channel, each listing only the Notifications the role gets. */
export function preferenceCards(
  role: UserRole,
  preferences: NotificationPreferences
): PreferenceCard[] {
  return CHANNELS.map((channel) => ({
    channel,
    title: CHANNEL_TITLES[channel],
    muted: preferences.mutedChannels[channel],
    rows: NOTIFICATION_KEYS.filter((key) => receives(role, key, channel)).map(
      (key) => {
        const { label, locked } = NOTIFICATIONS[key];
        return {
          key,
          label,
          locked,
          enabled:
            locked || preferences.notifications[key]?.[channel] !== false,
        };
      }
    ),
  }));
}

// ─── Changing them ───

export type PreferenceChange =
  | {
      intent: "notification";
      type: NotificationKey;
      channel: Channel;
      enabled: boolean;
    }
  | { intent: "mute-channel"; channel: Channel; muted: boolean }
  | { intent: "mute-everything"; muted: boolean };

export type PreferenceChangeResult =
  | { ok: true; preferences: NotificationPreferences }
  | { ok: false; status: 403; error: string };

/**
 * Applies one change from /settings. Refuses Locked Notifications, and
 * Notifications the person's role does not receive on that Channel.
 */
export function changePreference(
  preferences: NotificationPreferences,
  role: UserRole,
  change: PreferenceChange
): PreferenceChangeResult {
  switch (change.intent) {
    case "mute-everything":
      return {
        ok: true,
        preferences: { ...preferences, muteEverything: change.muted },
      };
    case "mute-channel":
      return {
        ok: true,
        preferences: {
          ...preferences,
          mutedChannels: {
            ...preferences.mutedChannels,
            [change.channel]: change.muted,
          },
        },
      };
    case "notification": {
      const { type, channel, enabled } = change;
      if (NOTIFICATIONS[type].locked) {
        return {
          ok: false,
          status: 403,
          error: "This Notification is always sent.",
        };
      }
      if (!receives(role, type, channel)) {
        return {
          ok: false,
          status: 403,
          error: "You don't receive this Notification on this Channel.",
        };
      }
      return {
        ok: true,
        preferences: {
          ...preferences,
          notifications: {
            ...preferences.notifications,
            [type]: { ...preferences.notifications[type], [channel]: enabled },
          },
        },
      };
    }
  }
}

// ─── Knock's PreferenceSet ───

type ChannelTypesSetting = { channel_types: ChannelChoices };

/** The subset of Knock's PreferenceSet that Cadence uses. */
export type KnockPreferenceSet = {
  channel_types: ChannelChoices;
  workflows: Record<string, boolean | ChannelTypesSetting>;
  categories: Record<string, boolean | ChannelTypesSetting>;
};

export function toKnockPreferenceSet(
  preferences: NotificationPreferences
): KnockPreferenceSet {
  const channelTypes: ChannelChoices = {};
  for (const channel of CHANNELS) {
    channelTypes[channel] = !preferences.mutedChannels[channel];
  }

  const workflows: KnockPreferenceSet["workflows"] = {};
  for (const [key, choices] of Object.entries(preferences.notifications)) {
    workflows[key] = { channel_types: { ...choices } };
  }

  return {
    channel_types: channelTypes,
    workflows,
    categories: { [MUTE_CATEGORY]: !preferences.muteEverything },
  };
}

export function fromKnockPreferenceSet(
  set: KnockPreferenceSet
): NotificationPreferences {
  const notifications: NotificationPreferences["notifications"] = {};
  for (const [key, setting] of Object.entries(set.workflows)) {
    if (!isNotificationKey(key)) continue;
    const choices: ChannelChoices =
      typeof setting === "boolean"
        ? Object.fromEntries(CHANNELS.map((channel) => [channel, setting]))
        : { ...setting.channel_types };
    if (Object.keys(choices).length > 0) notifications[key] = choices;
  }

  return {
    muteEverything: allows(set.categories[MUTE_CATEGORY], null) === false,
    mutedChannels: {
      email: set.channel_types.email === false,
      in_app_feed: set.channel_types.in_app_feed === false,
    },
    notifications,
  };
}

/** A missing setting allows; `channel` null asks about the setting as a whole. */
function allows(
  setting: boolean | ChannelTypesSetting | undefined,
  channel: Channel | null
): boolean {
  if (setting === undefined) return true;
  if (typeof setting === "boolean") return setting;
  if (channel === null) return true;
  return setting.channel_types[channel] !== false;
}

/** The parts of a Knock workflow that decide whether preferences apply. */
export type WorkflowPreferenceSettings = {
  key: string;
  overridesPreferences: boolean;
  categories: readonly string[];
};

/** Whether Knock would send a step of this workflow on this Channel. */
export function knockWouldDeliver(
  set: KnockPreferenceSet,
  workflow: WorkflowPreferenceSettings,
  channel: Channel
): boolean {
  if (workflow.overridesPreferences) return true;
  return (
    set.channel_types[channel] !== false &&
    allows(set.workflows[workflow.key], channel) &&
    workflow.categories.every((category) =>
      allows(set.categories[category], channel)
    )
  );
}
