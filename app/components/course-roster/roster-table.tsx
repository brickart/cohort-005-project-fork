import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Card, CardContent } from "~/components/ui/card";
import type {
  RosterSortColumn,
  RosterStudent,
  RosterView,
  SortDirection,
} from "~/modules/course-roster";
import { ProgressBar, QuizScoreBadge, StatusBadge } from "./roster-badges";

const COLUMNS: { column: RosterSortColumn; label: string }[] = [
  { column: "name", label: "Student" },
  { column: "enrolled", label: "Enrolled" },
  { column: "progress", label: "Progress" },
  { column: "status", label: "Status" },
  { column: "quiz", label: "Quiz Scores" },
];

export function RosterTable({
  students,
  showQuizzes,
  view,
  onSort,
}: {
  students: RosterStudent[];
  showQuizzes: boolean;
  view: Pick<RosterView, "sort" | "dir">;
  onSort: (column: RosterSortColumn) => void;
}) {
  const columns = showQuizzes
    ? COLUMNS
    : COLUMNS.filter(({ column }) => column !== "quiz");

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {columns.map(({ column, label }) => (
                  <SortableHeader
                    key={column}
                    label={label}
                    direction={view.sort === column ? view.dir : null}
                    onClick={() => onSort(column)}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <RosterRow
                  key={student.key}
                  student={student}
                  showQuizzes={showQuizzes}
                />
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

const HEADER_SORT = {
  asc: { Icon: ArrowUp, ariaSort: "ascending" },
  desc: { Icon: ArrowDown, ariaSort: "descending" },
  none: { Icon: ArrowUpDown, ariaSort: "none" },
} as const;

function SortableHeader({
  label,
  direction,
  onClick,
}: {
  label: string;
  direction: SortDirection | null;
  onClick: () => void;
}) {
  const { Icon, ariaSort } = HEADER_SORT[direction ?? "none"];

  return (
    <th aria-sort={ariaSort} className="px-4 py-3 text-left">
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wider hover:text-foreground ${
          direction ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {label}
        <Icon className={`size-3.5 ${direction ? "" : "opacity-50"}`} />
      </button>
    </th>
  );
}

function RosterRow({
  student,
  showQuizzes,
}: {
  student: RosterStudent;
  showQuizzes: boolean;
}) {
  const enrolledDate = new Date(student.enrolledAt).toLocaleDateString(
    "en-US",
    { year: "numeric", month: "short", day: "numeric" }
  );

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-3">
        <p className="text-sm font-medium">{student.name}</p>
        <p className="text-xs text-muted-foreground">{student.email}</p>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {enrolledDate}
      </td>
      <td className="px-4 py-3">
        <ProgressBar progress={student.progress} />
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={student.status} />
      </td>
      {showQuizzes && (
        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-2">
            {student.quizScores.map((qs) => (
              <div
                key={qs.quizId}
                className="flex items-center gap-1"
                title={`${qs.quizTitle} (${qs.lessonTitle})`}
              >
                <QuizScoreBadge score={qs} />
              </div>
            ))}
          </div>
        </td>
      )}
    </tr>
  );
}
