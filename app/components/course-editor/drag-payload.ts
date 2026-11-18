import type { DropResult } from "@hello-pangea/dnd";

type DraggableModule = { id: number; lessons: { id: number }[] };
type Payload = Record<string, string>;

function reorder<T>(items: T[], from: number, to: number): T[] {
  const reordered = Array.from(items);
  const [moved] = reordered.splice(from, 1);
  reordered.splice(to, 0, moved);
  return reordered;
}

function moduleIdOf(droppableId: string) {
  return parseInt(droppableId.replace("lessons-", ""), 10);
}

/**
 * The form a drop submits to the course editor action, or null when the drop
 * changes nothing.
 */
export function dragPayload(
  modules: DraggableModule[],
  result: DropResult
): Payload | null {
  const { source, destination } = result;
  if (!destination) return null;
  if (
    source.droppableId === destination.droppableId &&
    source.index === destination.index
  ) {
    return null;
  }

  if (result.type === "module") {
    const moduleIds = reorder(modules, source.index, destination.index).map(
      (m) => m.id
    );
    return { intent: "reorder-modules", moduleIds: JSON.stringify(moduleIds) };
  }
  if (result.type !== "lesson") return null;

  const sourceModuleId = moduleIdOf(source.droppableId);
  const destModuleId = moduleIdOf(destination.droppableId);
  const sourceMod = modules.find((m) => m.id === sourceModuleId);
  if (!sourceMod) return null;

  if (sourceModuleId === destModuleId) {
    const lessonIds = reorder(
      sourceMod.lessons,
      source.index,
      destination.index
    ).map((l) => l.id);
    return {
      intent: "reorder-lessons",
      moduleId: String(sourceModuleId),
      lessonIds: JSON.stringify(lessonIds),
    };
  }

  const lesson = sourceMod.lessons[source.index];
  if (!lesson) return null;
  return {
    intent: "move-lesson",
    lessonId: String(lesson.id),
    targetModuleId: String(destModuleId),
    // Target position is 1-based (destination index + 1)
    targetPosition: String(destination.index + 1),
  };
}
