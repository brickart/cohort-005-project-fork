import {
  isNotificationKey,
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
