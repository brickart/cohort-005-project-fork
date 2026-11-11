import { describe, expect, it } from "vitest";
import { createKnockNotificationService } from "./knock-service.server";
import {
  DEFAULT_PREFERENCES,
  type NotificationPreferences,
} from "./preferences";
import { isRetryableDeliveryError } from "./service.server";

// The Knock NotificationService, against a fake Knock API. The fake answers
// HTTP the way Knock's REST API does, so these tests pin down what Cadence
// sends and how it reads the answers, without credentials.

const FEED_CHANNEL_ID = "feed-channel-uuid";

type Recorded = {
  method: string;
  path: string;
  search: URLSearchParams;
  headers: Headers;
  body: unknown;
};

type Reply = { status: number; body?: unknown } | "network-error";
type Handler = (request: Recorded) => Reply | undefined;

function fakeKnock(handler: Handler = () => undefined) {
  const requests: Recorded[] = [];
  const fetch = async (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const text = typeof init?.body === "string" ? init.body : undefined;
    const request: Recorded = {
      method: (init?.method ?? "GET").toUpperCase(),
      path: url.pathname,
      search: url.searchParams,
      headers: new Headers(init?.headers),
      body: text ? JSON.parse(text) : undefined,
    };
    requests.push(request);
    const reply = handler(request) ?? { status: 200, body: {} };
    if (reply === "network-error") throw new TypeError("fetch failed");
    return new Response(
      reply.body === undefined ? null : JSON.stringify(reply.body),
      {
        status: reply.status,
        headers: { "content-type": "application/json" },
      }
    );
  };
  const service = createKnockNotificationService({
    apiKey: "sk_test_fake",
    feedChannelId: FEED_CHANNEL_ID,
    baseURL: "https://knock.test",
    fetch,
    maxRetries: 0,
  });
  return { service, requests };
}

const refundRaised = {
  idempotencyKey: "0d7b3c9e-6f0a-4c55-9d2e-5b8f1f6f2a11",
  type: "refund-request-raised",
  recipientId: 42,
  actorId: 42,
  data: {
    recipient: { email: "liam@example.com", name: "Liam" },
    actor_name: "Liam",
    title: "Refund requested — Intro to Rust",
    action_url: "/courses/intro-to-rust",
    preferences_url: "https://cadence.test/settings",
    course_title: "Intro to Rust",
    amount: "$79.00",
    refund_url: "https://cadence.test/courses/intro-to-rust",
  },
};

describe("delivering through Knock", () => {
  it("triggers the workflow for the recipient, identified inline, with the outbox key as Idempotency-Key", async () => {
    const { service, requests } = fakeKnock();

    await service.deliver(refundRaised);

    expect(requests).toHaveLength(1);
    const [trigger] = requests;
    expect(trigger.method).toBe("POST");
    expect(trigger.path).toBe("/v1/workflows/refund-request-raised/trigger");
    expect(trigger.headers.get("idempotency-key")).toBe(
      "0d7b3c9e-6f0a-4c55-9d2e-5b8f1f6f2a11"
    );
    expect(trigger.body).toEqual({
      recipients: [{ id: "42", email: "liam@example.com", name: "Liam" }],
      data: refundRaised.data,
    });
  });

  async function deliveryErrorFor(reply: Reply) {
    const { service } = fakeKnock(() => reply);
    return service.deliver(refundRaised).then(
      () => null,
      (error: unknown) => error
    );
  }

  it.each([
    [500, true],
    [503, true],
    [429, true],
    [400, false],
    [401, false],
    [404, false],
    [422, false],
  ])("treats a %i from Knock as retryable: %s", async (status, retryable) => {
    const error = await deliveryErrorFor({
      status,
      body: { message: "nope" },
    });

    expect(error).toMatchObject({ name: "NotificationDeliveryError", status });
    expect(isRetryableDeliveryError(error)).toBe(retryable);
  });

  it("treats a network error as retryable", async () => {
    const error = await deliveryErrorFor("network-error");

    expect(error).toMatchObject({
      name: "NotificationDeliveryError",
      status: null,
    });
    expect(isRetryableDeliveryError(error)).toBe(true);
  });
});

function feedEntry(
  id: string,
  options: { readAt?: string | null; insertedAt: string; type?: string }
) {
  return {
    __typename: "FeedItem",
    id,
    inserted_at: options.insertedAt,
    read_at: options.readAt ?? null,
    seen_at: null,
    source: { key: options.type ?? "refund-request-to-decide" },
    data: { title: `Refund request to decide — ${id}` },
    blocks: [
      {
        name: "body",
        type: "markdown",
        content: `Liam asked for a refund on Intro to Rust & Go.`,
        rendered: `<p>Liam asked for a refund on Intro to Rust &amp; Go.</p>\n`,
      },
      {
        name: "action_url",
        type: "text",
        content: "/admin/refunds",
        rendered: "/admin/refunds",
      },
    ],
  };
}

const FEED_PATH = `/v1/users/42/feeds/${FEED_CHANNEL_ID}`;

describe("reading the feed from Knock", () => {
  it("maps Knock's feed entries and takes the unread count from meta.unread_count", async () => {
    const { service } = fakeKnock((request) =>
      request.method === "GET" && request.path === FEED_PATH
        ? {
            status: 200,
            body: {
              entries: [
                feedEntry("msg_2", { insertedAt: "2026-11-11T12:02:00Z" }),
                feedEntry("msg_1", {
                  insertedAt: "2026-11-11T12:01:00Z",
                  readAt: "2026-11-11T12:05:00Z",
                }),
              ],
              meta: { unread_count: 7, unseen_count: 3, total_count: 9 },
              page_info: { after: null, before: null, page_size: 50 },
            },
          }
        : undefined
    );

    const feed = await service.getFeed(42);

    expect(feed.unreadCount).toBe(7);
    expect(feed.items).toEqual([
      {
        id: "msg_2",
        type: "refund-request-to-decide",
        title: "Refund request to decide — msg_2",
        body: "Liam asked for a refund on Intro to Rust & Go.",
        actionUrl: "/admin/refunds",
        insertedAt: "2026-11-11T12:02:00Z",
        readAt: null,
      },
      {
        id: "msg_1",
        type: "refund-request-to-decide",
        title: "Refund request to decide — msg_1",
        body: "Liam asked for a refund on Intro to Rust & Go.",
        actionUrl: "/admin/refunds",
        insertedAt: "2026-11-11T12:01:00Z",
        readAt: "2026-11-11T12:05:00Z",
      },
    ]);
  });
});

describe("marking the Knock feed read", () => {
  it("marks one message read in Knock", async () => {
    const { service, requests } = fakeKnock();

    await service.markRead(42, "msg_2");

    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      "PUT /v1/messages/msg_2/read",
    ]);
  });

  it("marks every unread message in the person's feed read, across pages", async () => {
    const { service, requests } = fakeKnock((request) => {
      if (request.method !== "GET" || request.path !== FEED_PATH) return;
      const unread = request.search.get("status") === "unread";
      if (!unread) return { status: 400, body: { message: "unread only" } };
      return request.search.get("after") === "cursor_1"
        ? {
            status: 200,
            body: {
              entries: [
                feedEntry("msg_1", { insertedAt: "2026-11-11T12:01Z" }),
              ],
              meta: { unread_count: 3 },
              page_info: { after: null },
            },
          }
        : {
            status: 200,
            body: {
              entries: [
                feedEntry("msg_3", { insertedAt: "2026-11-11T12:03Z" }),
                feedEntry("msg_2", { insertedAt: "2026-11-11T12:02Z" }),
              ],
              meta: { unread_count: 3 },
              page_info: { after: "cursor_1" },
            },
          };
    });

    await service.markAllRead(42);

    const batches = requests.filter(
      (r) => r.method === "POST" && r.path === "/v1/messages/batch/read"
    );
    expect(batches.map((r) => r.body)).toEqual([
      { message_ids: ["msg_3", "msg_2", "msg_1"] },
    ]);
  });

  it("sends nothing to mark when nothing is unread", async () => {
    const { service, requests } = fakeKnock((request) =>
      request.method === "GET"
        ? {
            status: 200,
            body: { entries: [], meta: { unread_count: 0 }, page_info: {} },
          }
        : undefined
    );

    await service.markAllRead(42);

    expect(requests.map((r) => r.method)).toEqual(["GET"]);
  });
});

const PREFERENCES_PATH = "/v1/users/42/preferences/default";

describe("Notification Preferences in Knock", () => {
  const muted: NotificationPreferences = {
    muteEverything: true,
    mutedChannels: { email: true, in_app_feed: false },
    notifications: {
      "lesson-question": { email: false },
      "comment-reply": { email: true, in_app_feed: false },
    },
  };

  it("writes them as the person's default PreferenceSet", async () => {
    const { service, requests } = fakeKnock();

    await service.setPreferences(42, muted);

    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("PUT");
    expect(requests[0].path).toBe(PREFERENCES_PATH);
    expect(requests[0].body).toEqual({
      channel_types: { email: false, in_app_feed: true },
      workflows: {
        "lesson-question": { channel_types: { email: false } },
        "comment-reply": { channel_types: { email: true, in_app_feed: false } },
      },
      categories: { cadence: false },
    });
  });

  it("identifies a person Knock doesn't know yet, then writes them", async () => {
    let identified = false;
    const { service, requests } = fakeKnock((request) => {
      if (request.method === "PUT" && request.path === "/v1/users/42") {
        identified = true;
        return { status: 200, body: { id: "42" } };
      }
      if (request.path === PREFERENCES_PATH && !identified) {
        return { status: 404, body: { message: "user not found" } };
      }
    });

    await service.setPreferences(42, muted);

    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      `PUT ${PREFERENCES_PATH}`,
      "PUT /v1/users/42",
      `PUT ${PREFERENCES_PATH}`,
    ]);
  });

  it("reads them back from Knock's PreferenceSet", async () => {
    const { service } = fakeKnock((request) =>
      request.method === "GET" && request.path === PREFERENCES_PATH
        ? {
            status: 200,
            body: {
              __typename: "PreferenceSet",
              id: "default",
              channel_types: { email: false, in_app_feed: true, sms: true },
              channels: null,
              commercial_subscribed: null,
              workflows: {
                "lesson-question": { channel_types: { email: false } },
                "comment-reply": {
                  channel_types: { email: true, in_app_feed: false },
                },
              },
              categories: { cadence: false },
            },
          }
        : undefined
    );

    expect(await service.getPreferences(42)).toEqual(muted);
  });

  it("reads an empty PreferenceSet as the defaults", async () => {
    const { service } = fakeKnock(() => ({
      status: 200,
      body: {
        id: "default",
        channel_types: null,
        workflows: null,
        categories: null,
      },
    }));

    expect(await service.getPreferences(42)).toEqual(DEFAULT_PREFERENCES);
  });

  it("ignores the parts of a PreferenceSet Cadence doesn't use", async () => {
    const { service } = fakeKnock(() => ({
      status: 200,
      body: {
        id: "default",
        channel_types: {
          email: { conditions: [{ variable: "x", operator: "equal_to" }] },
          in_app_feed: false,
        },
        workflows: {
          "lesson-question": "nonsense",
          "comment-reply": { conditions: [] },
          "course-status-changed": true,
        },
        categories: { cadence: { channel_types: { email: "yes" } } },
      },
    }));

    expect(await service.getPreferences(42)).toEqual({
      ...DEFAULT_PREFERENCES,
      mutedChannels: { email: false, in_app_feed: true },
      notifications: {
        "course-status-changed": { email: true, in_app_feed: true },
      },
    });
  });

  it("reads the defaults for a person Knock doesn't know yet", async () => {
    const { service } = fakeKnock(() => ({
      status: 404,
      body: { message: "not found" },
    }));

    expect(await service.getPreferences(42)).toEqual(DEFAULT_PREFERENCES);
  });
});
