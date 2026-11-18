import { Card, CardContent } from "~/components/ui/card";
import { Award, Users } from "lucide-react";

type QuizScore = {
  quizId: number;
  quizTitle: string;
  lessonTitle: string;
  bestScore: number | null;
  passed: boolean | null;
};

type StudentRow = {
  userId: number;
  name: string;
  email: string;
  enrolledAt: string;
  completedAt: string | null;
  progress: number;
  quizScores: QuizScore[];
};

const headerClass =
  "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";

export function StudentsTab({
  students,
  quizCount,
}: {
  students: StudentRow[];
  quizCount: number;
}) {
  return (
    <>
      <div className="mb-4 flex items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Users className="size-4" />
          {students.length} {students.length === 1 ? "student" : "students"}{" "}
          enrolled
        </span>
        {quizCount > 0 && (
          <span className="flex items-center gap-1.5">
            <Award className="size-4" />
            {quizCount} {quizCount === 1 ? "quiz" : "quizzes"}
          </span>
        )}
      </div>

      {students.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Users className="mx-auto mb-3 size-8 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              No students enrolled in this course yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <StudentsTable students={students} quizCount={quizCount} />
      )}
    </>
  );
}

function StudentsTable({
  students,
  quizCount,
}: {
  students: StudentRow[];
  quizCount: number;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className={headerClass}>Student</th>
                <th className={headerClass}>Enrolled</th>
                <th className={headerClass}>Progress</th>
                <th className={headerClass}>Status</th>
                {quizCount > 0 && <th className={headerClass}>Quiz Scores</th>}
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <StudentTableRow
                  key={student.userId}
                  student={student}
                  showQuizzes={quizCount > 0}
                />
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function StudentTableRow({
  student,
  showQuizzes,
}: {
  student: StudentRow;
  showQuizzes: boolean;
}) {
  const enrolledDate = new Date(student.enrolledAt).toLocaleDateString(
    "en-US",
    { year: "numeric", month: "short", day: "numeric" }
  );

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-3">
        <div>
          <p className="text-sm font-medium">{student.name}</p>
          <p className="text-xs text-muted-foreground">{student.email}</p>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {enrolledDate}
      </td>
      <td className="px-4 py-3">
        <ProgressBar progress={student.progress} />
      </td>
      <td className="px-4 py-3">
        <StatusBadge student={student} />
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

function ProgressBar({ progress }: { progress: number }) {
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

const badgeClass =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium";

function StatusBadge({ student }: { student: StudentRow }) {
  if (student.completedAt) {
    return (
      <span
        className={`${badgeClass} bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400`}
      >
        Completed
      </span>
    );
  }
  if (student.progress > 0) {
    return (
      <span
        className={`${badgeClass} bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400`}
      >
        In Progress
      </span>
    );
  }
  return (
    <span
      className={`${badgeClass} bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400`}
    >
      Not Started
    </span>
  );
}

function QuizScoreBadge({ score }: { score: QuizScore }) {
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
