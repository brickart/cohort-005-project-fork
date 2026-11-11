import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { CourseStatus, UserRole } from "~/db/schema";
import { changeCourseStatus } from "~/lib/courses.server";
import { createLocalNotificationService } from "./local-service.server";
import { deliverPending } from "./outbox.server";

// One trip down the whole path: domain function → outbox → deliverPending()
// → local NotificationService → feed item and rendered Email.

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://cadence.test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("archiving a course, end to end", () => {
  it("puts it in the Instructor's feed and renders their Email", async () => {
    const db = createTestDb();
    const { instructor, course } = seedBaseData(db);
    const admin = db
      .insert(schema.users)
      .values({
        name: "Pat Admin",
        email: "pat@example.com",
        role: UserRole.Admin,
      })
      .returning()
      .get();
    const now = new Date();
    const outboxDir = mkdtempSync(join(tmpdir(), "outbox-"));
    const service = createLocalNotificationService({ outboxDir });

    changeCourseStatus(db, course.id, CourseStatus.Archived, admin.id, now);
    await deliverPending(db, service, now);

    const feed = await service.getFeed(instructor.id);
    expect(feed.unreadCount).toBe(1);
    expect(feed.items[0]).toMatchObject({
      type: "course-status-changed",
      title: "Test Course was archived",
      body: "Test Course was archived.",
      actionUrl: `/instructor/${course.id}`,
    });

    const [email] = readdirSync(outboxDir)
      .filter((file) => file.endsWith(".json"))
      .map((file) => JSON.parse(readFileSync(join(outboxDir, file), "utf8")));
    expect(email).toMatchObject({
      to: "instructor@example.com",
      subject: "Test Course was archived",
      layout: "default",
    });
    expect(email.text).toContain("Hi Test Instructor,");
    expect(email.text).toContain("Pat Admin archived your course");
    expect(email.text).toContain("new Learners can't enroll");
    expect(email.html).toContain(
      `href="https://cadence.test/instructor/${course.id}"`
    );
  });
});
