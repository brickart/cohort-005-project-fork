import { Link, useFetcher } from "react-router";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DraggableProvided,
  type DropResult,
} from "@hello-pangea/dnd";
import { formatDuration } from "~/lib/utils";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { BookOpen, Clock, Eye, FileEdit, GripVertical } from "lucide-react";
import { useFetcherToast } from "./use-fetcher-toast";
import { dragPayload } from "./drag-payload";
import {
  InlineEditableModuleTitle,
  DeleteModuleButton,
  AddModuleForm,
} from "./module-editors";
import {
  InlineEditableLessonTitle,
  DeleteLessonButton,
  AddLessonForm,
} from "./lesson-editors";

type Lesson = { id: number; title: string; durationMinutes: number | null };
type CourseModule = { id: number; title: string; lessons: Lesson[] };
type Course = { id: number; slug: string; modules: CourseModule[] };

export function ContentTab({ course }: { course: Course }) {
  const reorderFetcher = useFetcher();
  const lessonReorderFetcher = useFetcher();
  useFetcherToast(reorderFetcher, "Modules reordered.");
  useFetcherToast(lessonReorderFetcher, "Lessons reordered.");

  function handleDragEnd(result: DropResult) {
    const payload = dragPayload(course.modules, result);
    if (!payload) return;
    const fetcher =
      result.type === "module" ? reorderFetcher : lessonReorderFetcher;
    fetcher.submit(payload, { method: "post" });
  }

  return (
    <>
      {course.modules.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <BookOpen className="mx-auto mb-3 size-8 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              No modules yet. Add your first module to start building content.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ModuleList course={course} onDragEnd={handleDragEnd} />
      )}
      <AddModuleForm />
    </>
  );
}

function ModuleList({
  course,
  onDragEnd,
}: {
  course: Course;
  onDragEnd: (result: DropResult) => void;
}) {
  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId="modules" type="module">
        {(provided) => (
          <div
            className="space-y-4"
            ref={provided.innerRef}
            {...provided.droppableProps}
          >
            {course.modules.map((mod, index) => (
              <Draggable
                key={mod.id}
                draggableId={String(mod.id)}
                index={index}
              >
                {(provided, snapshot) => (
                  <div ref={provided.innerRef} {...provided.draggableProps}>
                    <ModuleCard
                      course={course}
                      mod={mod}
                      provided={provided}
                      isDragging={snapshot.isDragging}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}

function ModuleCard({
  course,
  mod,
  provided,
  isDragging,
}: {
  course: Course;
  mod: CourseModule;
  provided: DraggableProvided;
  isDragging: boolean;
}) {
  return (
    <Card className={isDragging ? "shadow-lg ring-2 ring-primary/50" : ""}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            <div
              {...provided.dragHandleProps}
              className="cursor-grab active:cursor-grabbing rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <GripVertical className="size-5" />
            </div>
            <div className="flex-1">
              <InlineEditableModuleTitle value={mod.title} moduleId={mod.id} />
              <p className="mt-1 px-2 text-sm text-muted-foreground">
                {mod.lessons.length}{" "}
                {mod.lessons.length === 1 ? "lesson" : "lessons"}
              </p>
            </div>
          </div>
          <DeleteModuleButton moduleId={mod.id} moduleTitle={mod.title} />
        </div>
      </CardHeader>
      <CardContent>
        {mod.lessons.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">
            No lessons yet.
          </p>
        ) : (
          <LessonList course={course} mod={mod} />
        )}
        <AddLessonForm moduleId={mod.id} />
      </CardContent>
    </Card>
  );
}

function LessonList({ course, mod }: { course: Course; mod: CourseModule }) {
  return (
    <Droppable droppableId={`lessons-${mod.id}`} type="lesson">
      {(lessonDropProvided) => (
        <ul
          className="space-y-1"
          ref={lessonDropProvided.innerRef}
          {...lessonDropProvided.droppableProps}
        >
          {mod.lessons.map((lesson, lessonIndex) => (
            <Draggable
              key={lesson.id}
              draggableId={`lesson-${lesson.id}`}
              index={lessonIndex}
            >
              {(lessonProvided, lessonSnapshot) => (
                <li
                  ref={lessonProvided.innerRef}
                  {...lessonProvided.draggableProps}
                >
                  <LessonRow
                    course={course}
                    lesson={lesson}
                    provided={lessonProvided}
                    isDragging={lessonSnapshot.isDragging}
                  />
                </li>
              )}
            </Draggable>
          ))}
          {lessonDropProvided.placeholder}
        </ul>
      )}
    </Droppable>
  );
}

function LessonRow({
  course,
  lesson,
  provided,
  isDragging,
}: {
  course: Course;
  lesson: Lesson;
  provided: DraggableProvided;
  isDragging: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm${
        isDragging ? " bg-muted shadow-md ring-1 ring-primary/30" : ""
      }`}
    >
      <div
        {...provided.dragHandleProps}
        className="cursor-grab active:cursor-grabbing rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted"
      >
        <GripVertical className="size-4" />
      </div>
      <div className="flex-1">
        <InlineEditableLessonTitle value={lesson.title} lessonId={lesson.id} />
      </div>
      {lesson.durationMinutes && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="size-3" />
          {formatDuration(lesson.durationMinutes, true, false, false)}
        </span>
      )}
      <LessonLink
        to={`/courses/${course.slug}/lessons/${lesson.id}`}
        title="View lesson"
      >
        <Eye className="size-3.5" />
      </LessonLink>
      <LessonLink
        to={`/instructor/${course.id}/lessons/${lesson.id}`}
        title="Edit lesson"
      >
        <FileEdit className="size-3.5" />
      </LessonLink>
      <DeleteLessonButton lessonId={lesson.id} lessonTitle={lesson.title} />
    </div>
  );
}

function LessonLink({
  to,
  title,
  children,
}: {
  to: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Link to={to} title={title}>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
      >
        {children}
      </Button>
    </Link>
  );
}
