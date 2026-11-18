import { Award, Users } from "lucide-react";
import { Card, CardContent } from "~/components/ui/card";
import { applyRosterView, type RosterStudent } from "~/modules/course-roster";
import { RosterTable } from "./roster-table";
import { RosterToolbar } from "./roster-toolbar";
import { useRosterView } from "./use-roster-view";

/** The searchable, sortable student roster; its view lives in the URL. */
export function RosterPanel({
  students,
  quizCount,
}: {
  students: RosterStudent[];
  quizCount: number;
}) {
  const { view, update, sortBy, clearFilters } = useRosterView();
  const shown = applyRosterView(students, view);

  return (
    <>
      <div className="mb-4 flex items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Users className="size-4" />
          {students.length} {students.length === 1 ? "student" : "students"}{" "}
          enrolled
          {shown.length !== students.length && ` · showing ${shown.length}`}
        </span>
        {quizCount > 0 && (
          <span className="flex items-center gap-1.5">
            <Award className="size-4" />
            {quizCount} {quizCount === 1 ? "quiz" : "quizzes"}
          </span>
        )}
      </div>

      {students.length === 0 ? (
        <EmptyCard message="No students enrolled in this course yet." />
      ) : (
        <>
          <RosterToolbar view={view} onChange={update} onClear={clearFilters} />
          {shown.length === 0 ? (
            <EmptyCard message="No students match these filters." />
          ) : (
            <RosterTable
              students={shown}
              showQuizzes={quizCount > 0}
              view={view}
              onSort={sortBy}
            />
          )}
        </>
      )}
    </>
  );
}

function EmptyCard({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="py-8 text-center">
        <Users className="mx-auto mb-3 size-8 text-muted-foreground/50" />
        <p className="text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
}
