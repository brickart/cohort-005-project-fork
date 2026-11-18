import type { RosterStatus } from "~/db/schema";

export type RosterQuizScore = {
  quizId: number;
  quizTitle: string;
  lessonTitle: string;
  bestScore: number | null;
  passed: boolean | null;
};

export type RosterStudent = {
  /** Unique per row: a Student can hold two Enrollments on one course. */
  key: string;
  enrollmentId: number | null;
  userId: number;
  name: string;
  email: string;
  enrolledAt: string;
  progress: number;
  status: RosterStatus;
  quizScores: RosterQuizScore[];
};

export type CourseRoster = {
  students: RosterStudent[];
  quizCount: number;
};
