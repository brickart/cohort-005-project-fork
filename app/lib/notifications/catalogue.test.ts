import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_KEYS,
  NOTIFICATIONS,
  type NotificationDataMap,
} from "./catalogue";
import {
  readWorkflow,
  renderEmail,
  renderInApp,
} from "./knock-templates.server";

// The catalogue and the Knock workflows in .knock/ must agree, or a
// Notification ships with no workflow, or a Locked Notification without its
// override. Runs with no Knock credentials.

const FIXTURES: { [K in keyof NotificationDataMap]: NotificationDataMap[K] } = {
  "refund-request-raised": {
    recipient: { email: "liam@example.com", name: "Liam" },
    actor_name: "Liam",
    title: "Refund requested — Intro to Rust",
    action_url: "/settings",
    preferences_url: "https://cadence.test/settings",
    course_title: "Intro to Rust",
    amount: "$79.00",
    refund_url: "https://cadence.test/settings",
  },
  "refund-request-to-decide": {
    recipient: { email: "pat@example.com", name: "Pat" },
    actor_name: "Liam",
    title: "Refund request to decide — Intro to Rust",
    action_url: "/admin/refunds",
    preferences_url: "https://cadence.test/settings",
    course_title: "Intro to Rust",
    amount: "$79.00",
    buyer_name: "Liam",
    reason: "It was not what I expected.",
    refunds_url: "https://cadence.test/admin/refunds",
  },
  "course-status-changed": {
    recipient: { email: "ines@example.com", name: "Ines" },
    actor_name: "Pat",
    title: "Intro to Rust was archived",
    action_url: "/instructor/7",
    preferences_url: "https://cadence.test/settings",
    course_title: "Intro to Rust",
    status: "archived",
    course_url: "https://cadence.test/instructor/7",
  },
};

const HTML_TAG = /<\/?[a-z][^>]*>/i;

describe.each(NOTIFICATION_KEYS)("the %s workflow", (key) => {
  const entry = NOTIFICATIONS[key];
  const sendsEmail = entry.channels.includes("email");

  it("has an In-app step", () => {
    expect(readWorkflow(key).inApp).not.toBeNull();
  });

  it("has an Email step exactly when Email is a default Channel", () => {
    const { email } = readWorkflow(key);
    expect(email !== null).toBe(sendsEmail);
    if (email) {
      expect(email.subject).not.toBe("");
      expect(email.htmlBodyPath).toMatch(/html_body\.html$/);
      expect(email.textBodyPath).toMatch(/text_body\.txt$/);
    }
  });

  it("overrides recipient preferences exactly when it is locked", () => {
    expect(readWorkflow(key).overridesPreferences).toBe(entry.locked);
  });

  it.runIf(sendsEmail)(
    "uses the cadence-locked layout exactly when it is locked",
    () => {
      const layout = readWorkflow(key).email?.layoutKey;
      if (entry.locked) expect(layout).toBe("cadence-locked");
      else expect(layout).not.toBe("cadence-locked");
    }
  );

  it("renders its In-app step against fixture data", () => {
    const inApp = renderInApp(key, FIXTURES[key]);
    expect(inApp.body).not.toBe("");
    expect(inApp.actionUrl).toBe(FIXTURES[key].action_url);
  });

  it.runIf(sendsEmail)("renders its Email against fixture data", () => {
    const email = renderEmail(key, FIXTURES[key]);

    expect(email.subject).toBe(FIXTURES[key].title);
    expect(email.bodyHtml).not.toMatch(/<html|<body/i);
    expect(email.bodyHtml).toMatch(/^\s*<p>Hi [^<]+,<\/p>/);
    expect(email.html).toMatch(/<html/i);
    expect(email.text).not.toMatch(HTML_TAG);
    expect(email.text).toMatch(/^Hi .+,/m);
  });
});

describe("the Email layouts", () => {
  it("gives a non-locked Email a link to Notification Preferences", () => {
    const email = renderEmail(
      "refund-request-to-decide",
      FIXTURES["refund-request-to-decide"]
    );
    expect(email.html).toContain('href="https://cadence.test/settings"');
    expect(email.text).toContain("https://cadence.test/settings");
    expect(email.text).not.toContain("We always send this email");
  });

  it("tells the recipient of a Locked Email why it is always sent", () => {
    const email = renderEmail(
      "refund-request-raised",
      FIXTURES["refund-request-raised"]
    );
    expect(email.html).toContain("We always send this email");
    expect(email.text).toContain("We always send this email");
    expect(email.text).not.toContain("Notification Preferences");
  });

  it("refuses to render a template that uses missing data", () => {
    const { amount: _amount, ...withoutAmount } =
      FIXTURES["refund-request-raised"];
    expect(() => renderEmail("refund-request-raised", withoutAmount)).toThrow(
      /amount/
    );
  });
});
