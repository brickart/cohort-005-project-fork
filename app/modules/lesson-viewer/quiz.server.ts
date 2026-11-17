/** The Lesson's quiz: reading it, and grading and recording an attempt. */
import { db } from "~/db";
import * as quiz from "./lib/quiz.server";

export function getQuizByLessonId(lessonId: number) {
  return quiz.getQuizByLessonId(db, lessonId);
}

export function getQuizInLesson(quizId: number, lessonId: number) {
  return quiz.getQuizInLesson(db, quizId, lessonId);
}

export function getQuizWithQuestions(quizId: number) {
  return quiz.getQuizWithQuestions(db, quizId);
}

export function getBestAttempt(userId: number, quizId: number) {
  return quiz.getBestAttempt(db, userId, quizId);
}

export function computeResult(
  userId: number,
  quizId: number,
  selectedAnswers: Record<number, number>
) {
  return quiz.computeResult(db, { userId, quizId }, selectedAnswers);
}
