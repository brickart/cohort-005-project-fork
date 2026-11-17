/** The Lesson's Questions & Discussion thread, read and rendered. */
import { db } from "~/db";
import * as thread from "./lib/thread.server";

export { renderThread } from "./lib/thread.server";

export function getCommentById(commentId: number) {
  return thread.getCommentById(db, commentId);
}

export function getLessonThread(lessonId: number) {
  return thread.getLessonThread(db, lessonId);
}
