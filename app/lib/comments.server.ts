import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { comments, courses, lessons, modules, users } from "~/db/schema";
import { appUrl } from "~/lib/app-url.server";
import { MAX_COMMENT_LENGTH, MIN_COMMENT_LENGTH } from "~/lib/comments";
import { enqueueNotifications } from "~/lib/notifications/outbox.server";

// ─── Lesson comments ───
// Posting a question or a reply on a lesson, from the lesson page or the
// instructor questions page. The comment and the Notification it causes are
// written in one transaction (docs/adr/0008).
//
// Takes the database first, so tests can hand in an in-memory one. Uses
// positional parameters (project convention).

type Db = BetterSQLite3Database<typeof schema>;

type Comment = typeof comments.$inferSelect;

const EXCERPT_LENGTH = 200;

/** Trims a comment body, or throws a user-facing Error if it is out of range. */
export function assertValidCommentBody(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length < MIN_COMMENT_LENGTH) {
    throw new Error("Comment cannot be empty");
  }
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    throw new Error(
      `Comment must be ${MAX_COMMENT_LENGTH} characters or fewer`
    );
  }
  return trimmed;
}

function excerpt(body: string): string {
  return body.length <= EXCERPT_LENGTH
    ? body
    : `${body.slice(0, EXCERPT_LENGTH - 1)}…`;
}

/**
 * Posts a top-level question (parentId null) or a one-level reply. A question
 * notifies the course's Instructor (`lesson-question`); a reply notifies only
 * the parent comment's author (`comment-reply`). Nobody is notified about
 * their own comment. Throws an Error with a user-facing message when the
 * comment can't be posted.
 */
export function postComment(
  db: Db,
  userId: number,
  lessonId: number,
  parentId: number | null,
  body: string,
  now: Date = new Date()
): Comment {
  const trimmed = assertValidCommentBody(body);

  return db.transaction((tx) => {
    const lesson = tx
      .select({
        lessonTitle: lessons.title,
        courseTitle: courses.title,
        courseSlug: courses.slug,
        instructorId: courses.instructorId,
      })
      .from(lessons)
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .innerJoin(courses, eq(modules.courseId, courses.id))
      .where(eq(lessons.id, lessonId))
      .get();
    if (!lesson) {
      throw new Error("Lesson not found");
    }

    let parent: Comment | undefined;
    if (parentId !== null) {
      parent = tx.select().from(comments).where(eq(comments.id, parentId)).get();
      if (!parent) {
        throw new Error("Parent comment not found");
      }
      if (parent.lessonId !== lessonId) {
        throw new Error("Parent comment belongs to a different lesson");
      }
      if (parent.parentId !== null) {
        throw new Error("Replies can only be one level deep");
      }
    }

    const comment = tx
      .insert(comments)
      .values({ userId, lessonId, parentId, body: trimmed })
      .returning()
      .get();

    const recipientId = parent ? parent.userId : lesson.instructorId;
    const [recipient, author] = [recipientId, userId].map((id) =>
      tx.select().from(users).where(eq(users.id, id)).get()
    );
    if (!recipient || !author) {
      throw new Error("User not found");
    }

    const lessonPath = `/courses/${lesson.courseSlug}/lessons/${lessonId}`;
    const data = {
      recipient: { email: recipient.email, name: recipient.name },
      actor_name: author.name,
      action_url: lessonPath,
      preferences_url: appUrl("/settings"),
      course_title: lesson.courseTitle,
      lesson_title: lesson.lessonTitle,
      comment_excerpt: excerpt(trimmed),
      lesson_url: appUrl(lessonPath),
    };

    enqueueNotifications(
      tx,
      [
        parent
          ? {
              type: "comment-reply",
              recipientId,
              data: {
                ...data,
                title: `${author.name} replied to your comment on ${lesson.lessonTitle}`,
              },
            }
          : {
              type: "lesson-question",
              recipientId,
              data: {
                ...data,
                title: `New question on ${lesson.lessonTitle}`,
              },
            },
      ],
      userId,
      now
    );

    return comment;
  });
}
