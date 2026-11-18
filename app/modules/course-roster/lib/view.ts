import { z } from "zod";
import { RosterStatus } from "~/db/schema";
import type { RosterStudent } from "./types";

export const ROSTER_SORT_COLUMNS = [
  "name",
  "enrolled",
  "progress",
  "status",
  "quiz",
] as const;

export type RosterSortColumn = (typeof ROSTER_SORT_COLUMNS)[number];
export type SortDirection = "asc" | "desc";

export type RosterView = {
  q: string;
  /** Inclusive `YYYY-MM-DD` bounds on the enrolled date, or "" for none. */
  from: string;
  to: string;
  sort: RosterSortColumn;
  dir: SortDirection;
};

export const DEFAULT_ROSTER_VIEW: RosterView = {
  q: "",
  from: "",
  to: "",
  sort: "enrolled",
  dir: "desc",
};

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const viewSchema = z.object({
  q: z.string().catch(DEFAULT_ROSTER_VIEW.q),
  from: isoDay.catch(DEFAULT_ROSTER_VIEW.from),
  to: isoDay.catch(DEFAULT_ROSTER_VIEW.to),
  sort: z.enum(ROSTER_SORT_COLUMNS).catch(DEFAULT_ROSTER_VIEW.sort),
  dir: z.enum(["asc", "desc"]).catch(DEFAULT_ROSTER_VIEW.dir),
});

/** Read the roster view from search params. Anything unusable falls back to the default. */
export function parseRosterView(params: URLSearchParams): RosterView {
  return viewSchema.parse({
    q: params.get("q") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    sort: params.get("sort") ?? undefined,
    dir: params.get("dir") ?? undefined,
  });
}

// The calendar day the roster shows, which is the viewer's local day.
function localDay(timestamp: string): string {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function filterRoster(
  students: RosterStudent[],
  { q, from, to }: Pick<RosterView, "q" | "from" | "to">
): RosterStudent[] {
  const needle = q.trim().toLowerCase();
  return students.filter((student) => {
    if (
      needle &&
      !student.name.toLowerCase().includes(needle) &&
      !student.email.toLowerCase().includes(needle)
    ) {
      return false;
    }
    if (!from && !to) return true;
    const day = localDay(student.enrolledAt);
    return (!from || day >= from) && (!to || day <= to);
  });
}

const STATUS_ORDER: Record<RosterStatus, number> = {
  [RosterStatus.NotStarted]: 0,
  [RosterStatus.InProgress]: 1,
  [RosterStatus.Completed]: 2,
  [RosterStatus.Lapsed]: 3,
};

/** Mean of the best scores, or null for a Student with no attempt. */
export function averageQuizScore(student: RosterStudent): number | null {
  const scores = student.quizScores
    .map((score) => score.bestScore)
    .filter((score) => score !== null);
  if (scores.length === 0) return null;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

const byName = (a: RosterStudent, b: RosterStudent) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

const COMPARE: Record<
  Exclude<RosterSortColumn, "quiz">,
  (a: RosterStudent, b: RosterStudent) => number
> = {
  name: byName,
  enrolled: (a, b) => a.enrolledAt.localeCompare(b.enrolledAt),
  progress: (a, b) => a.progress - b.progress,
  status: (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
};

function compareQuiz(a: RosterStudent, b: RosterStudent, sign: number): number {
  const left = averageQuizScore(a);
  const right = averageQuizScore(b);
  // No attempt sorts last whichever way the column runs.
  if (left === null || right === null) {
    return Number(left === null) - Number(right === null);
  }
  return (left - right) * sign;
}

export function sortRoster(
  students: RosterStudent[],
  { sort, dir }: Pick<RosterView, "sort" | "dir">
): RosterStudent[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...students].sort((a, b) => {
    const order =
      sort === "quiz" ? compareQuiz(a, b, sign) : COMPARE[sort](a, b) * sign;
    return order || byName(a, b);
  });
}

/** The rows the roster shows for a view: filtered, then sorted. */
export function applyRosterView(
  students: RosterStudent[],
  view: RosterView
): RosterStudent[] {
  return sortRoster(filterRoster(students, view), view);
}
