import { RosterStatus } from "~/db/schema";
import type { RosterQuizScore } from "~/modules/course-roster";

const STATUS_BADGE: Record<RosterStatus, { label: string; colours: string }> = {
  [RosterStatus.Lapsed]: {
    label: "Lapsed",
    colours:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  },
  [RosterStatus.Completed]: {
    label: "Completed",
    colours:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  [RosterStatus.InProgress]: {
    label: "In Progress",
    colours: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  },
  [RosterStatus.NotStarted]: {
    label: "Not Started",
    colours: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
  },
};

export function StatusBadge({ status }: { status: RosterStatus }) {
  const { label, colours } = STATUS_BADGE[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colours}`}
    >
      {label}
    </span>
  );
}

export function QuizScoreBadge({ score }: { score: RosterQuizScore }) {
  if (score.bestScore === null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const colours = score.passed
    ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
    : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colours}`}
    >
      {Math.round(score.bestScore * 100)}%
    </span>
  );
}

export function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 rounded-full bg-muted">
        <div
          className="h-2 rounded-full bg-primary transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="text-sm font-medium">{progress}%</span>
    </div>
  );
}
