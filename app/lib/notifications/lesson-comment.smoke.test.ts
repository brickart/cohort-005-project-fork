import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { postComment } from "~/lib/comments.server";
import { createLocalNotificationService } from "./local-service.server";
import { deliverPending } from "./outbox.server";

// One trip down the whole path for lesson-question and comment-reply:
// postComment → outbox → deliverPending() → local NotificationService → feed
// item and rendered Email.

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://cadence.test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("asking and answering a lesson question, end to end", () => {
  it("puts the question in the Instructor's feed and the answer in the asker's", async () => {
    const db = createTestDb();
    const { user, instructor, course } = seedBaseData(db);
    const module = db
      .insert(schema.modules)
      .values({ courseId: course.id, title: "Basics", position: 1 })
      .returning()
      .get();
    const lesson = db
      .insert(schema.lessons)
      .values({ moduleId: module.id, title: "Ownership", position: 1 })
      .returning()
      .get();
    const lessonPath = `/courses/test-course/lessons/${lesson.id}`;

    const outboxDir = mkdtempSync(join(tmpdir(), "outbox-"));
    const service = createLocalNotificationService({ outboxDir });
    const now = new Date();

    const question = postComment(db, user.id, lesson.id, null, "Why?", now);
    postComment(db, instructor.id, lesson.id, question.id, "Because.", now);
    await deliverPending(db, service, now);

    const instructorFeed = await service.getFeed(instructor.id);
    expect(instructorFeed.items).toHaveLength(1);
    expect(instructorFeed.items[0]).toMatchObject({
      type: "lesson-question",
      title: "New question on Ownership",
      body: "Test User asked a new question on Ownership in Test Course.",
      actionUrl: lessonPath,
    });

    const askerFeed = await service.getFeed(user.id);
    expect(askerFeed.items).toHaveLength(1);
    expect(askerFeed.items[0]).toMatchObject({
      type: "comment-reply",
      body: "Test Instructor replied to your comment on Ownership.",
      actionUrl: lessonPath,
    });

    const emails = readdirSync(outboxDir)
      .filter((file) => file.endsWith(".json"))
      .map((file) => JSON.parse(readFileSync(join(outboxDir, file), "utf8")));
    const toInstructor = emails.find(
      (email) => email.to === "instructor@example.com"
    );
    expect(toInstructor).toMatchObject({
      subject: "New question on Ownership",
      layout: "default",
    });
    expect(toInstructor.html).toContain(
      `href="https://cadence.test${lessonPath}"`
    );
    expect(
      emails.find((email) => email.to === "test@example.com")
    ).toMatchObject({
      subject: "Test Instructor replied to your comment on Ownership",
    });
  });
});
