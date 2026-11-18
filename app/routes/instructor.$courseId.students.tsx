import { Link } from "react-router";
import type { Route } from "./+types/instructor.$courseId.students";
import { coursePermissions } from "~/modules/permissions/course-permissions.server";
import { Button } from "~/components/ui/button";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { isRouteErrorResponse } from "react-router";
import { RosterPanel } from "~/components/course-roster/roster-panel";
import { courseRoster } from "~/modules/course-roster/index.server";
import { searchOnlyNavigation } from "~/lib/revalidation";

// The roster filters and sorts in the browser, so changing its view needs no
// trip to the loader.
export const shouldRevalidate = searchOnlyNavigation;

export function meta({ loaderData }: Route.MetaArgs) {
  const title = loaderData?.course?.title ?? "Student Roster";
  return [
    { title: `Students: ${title} — Cadence` },
    { name: "description", content: `Enrolled students for ${title}` },
  ];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const { course } = await coursePermissions.requireCapability(
    request,
    "manage",
    { courseId: params.courseId }
  );

  const roster = courseRoster.list(course.id, { includeLapsed: true });

  return { course, roster };
}

export default function InstructorStudentRoster({
  loaderData,
}: Route.ComponentProps) {
  const { course, roster } = loaderData;

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link to="/instructor" className="hover:text-foreground">
          My Courses
        </Link>
        <span className="mx-2">/</span>
        <Link to={`/instructor/${course.id}`} className="hover:text-foreground">
          {course.title}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Students</span>
      </nav>

      <Link
        to={`/instructor/${course.id}`}
        className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1 size-4" />
        Back to Course Editor
      </Link>

      <div className="mb-8">
        <h1 className="text-3xl font-bold">Student Roster</h1>
        <p className="mt-1 text-muted-foreground">
          Enrolled students for {course.title}
        </p>
      </div>

      <RosterPanel roster={roster} />
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message =
    "An unexpected error occurred while loading the student roster.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      title = "Course not found";
      message =
        "The course you're looking for doesn't exist or may have been removed.";
    } else if (error.status === 401) {
      title = "Sign in required";
      message =
        typeof error.data === "string"
          ? error.data
          : "Please select a user from the DevUI panel.";
    } else if (error.status === 403) {
      title = "Not allowed";
      message =
        typeof error.data === "string"
          ? error.data
          : "You don't have permission to view this roster.";
    } else {
      title = `Error ${error.status}`;
      message = typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/instructor">
            <Button variant="outline">My Courses</Button>
          </Link>
          <Link to="/">
            <Button>Go Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
