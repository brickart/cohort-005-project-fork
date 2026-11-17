import { db } from "~/db";
import {
  QuestionType,
  modules,
  lessons,
  quizzes,
  quizQuestions,
  quizOptions,
  quizAttempts,
  quizAnswers,
} from "~/db/schema";
import { eq, sql } from "drizzle-orm";

export function getModuleById(id: number) {
  return db.select().from(modules).where(eq(modules.id, id)).get();
}

export function getLessonById(id: number) {
  return db.select().from(lessons).where(eq(lessons.id, id)).get();
}

function getQuizById(id: number) {
  return db.select().from(quizzes).where(eq(quizzes.id, id)).get();
}

export function getQuizByLessonId(lessonId: number) {
  return db.select().from(quizzes).where(eq(quizzes.lessonId, lessonId)).get();
}

function getQuestionsByQuiz(quizId: number) {
  return db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quizId))
    .orderBy(quizQuestions.position)
    .all();
}

export function getQuizWithQuestions(quizId: number) {
  const quiz = getQuizById(quizId);
  if (!quiz) return null;

  const questions = db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quizId))
    .orderBy(quizQuestions.position)
    .all();

  const questionsWithOptions = questions.map((question) => {
    const options = db
      .select()
      .from(quizOptions)
      .where(eq(quizOptions.questionId, question.id))
      .all();
    return { ...question, options };
  });

  return { ...quiz, questions: questionsWithOptions };
}

export function createQuiz(
  lessonId: number,
  title: string,
  passingScore: number
) {
  return db
    .insert(quizzes)
    .values({ lessonId, title, passingScore })
    .returning()
    .get();
}

export function deleteQuiz(id: number) {
  // Cascade: delete answers -> attempts -> options -> questions -> quiz
  const questions = getQuestionsByQuiz(id);
  for (const question of questions) {
    db.delete(quizOptions).where(eq(quizOptions.questionId, question.id)).run();
  }

  const attempts = db
    .select()
    .from(quizAttempts)
    .where(eq(quizAttempts.quizId, id))
    .all();
  for (const attempt of attempts) {
    db.delete(quizAnswers).where(eq(quizAnswers.attemptId, attempt.id)).run();
  }

  db.delete(quizAttempts).where(eq(quizAttempts.quizId, id)).run();
  db.delete(quizQuestions).where(eq(quizQuestions.quizId, id)).run();
  return db.delete(quizzes).where(eq(quizzes.id, id)).returning().get();
}

export function createQuestion(
  quizId: number,
  {
    questionText,
    questionType,
    position,
  }: {
    questionText: string;
    questionType: QuestionType;
    position: number | null;
  }
) {
  const pos =
    position ??
    (db
      .select({
        max: sql<number>`coalesce(max(${quizQuestions.position}), 0)`,
      })
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quizId))
      .get()?.max ?? 0) + 1;

  return db
    .insert(quizQuestions)
    .values({ quizId, questionText, questionType, position: pos })
    .returning()
    .get();
}

export function createOption(
  questionId: number,
  optionText: string,
  isCorrect: boolean
) {
  return db
    .insert(quizOptions)
    .values({ questionId, optionText, isCorrect })
    .returning()
    .get();
}
