import { useState } from "react";
import { useFetcher } from "react-router";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useFetcherToast } from "./use-fetcher-toast";
import { useInlineEdit, isEnter } from "./use-inline-edit";
import { useAddForm } from "./use-add-form";
import { ConfirmDeletePrompt } from "./confirm-delete-prompt";

export function InlineEditableLessonTitle({
  value,
  lessonId,
}: {
  value: string;
  lessonId: number;
}) {
  const fetcher = useFetcher();
  const edit = useInlineEdit<HTMLInputElement>({
    value,
    isSaveKey: isEnter,
    onCommit: (title) =>
      fetcher.submit(
        { intent: "rename-lesson", lessonId: String(lessonId), title },
        { method: "post" }
      ),
  });

  if (edit.isEditing) {
    return (
      <input
        ref={edit.ref}
        type="text"
        value={edit.editValue}
        onChange={(event) => edit.setEditValue(event.target.value)}
        onBlur={edit.save}
        onKeyDown={edit.onKeyDown}
        className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={edit.startEditing}
      className="group flex items-center gap-1.5 rounded-md px-1 py-0.5 text-left text-sm hover:bg-muted"
    >
      <span className="flex-1">{value}</span>
      <Pencil className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

export function DeleteLessonButton({
  lessonId,
}: {
  lessonId: number;
  lessonTitle: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const fetcher = useFetcher();
  useFetcherToast(fetcher, "Lesson deleted.");

  if (confirming) {
    return (
      <ConfirmDeletePrompt
        label="Delete?"
        buttonClassName="h-6 text-xs"
        onConfirm={() => {
          fetcher.submit(
            { intent: "delete-lesson", lessonId: String(lessonId) },
            { method: "post" }
          );
          setConfirming(false);
        }}
        onCancel={() => setConfirming(false)}
      />
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
      onClick={() => setConfirming(true)}
    >
      <Trash2 className="size-3.5" />
    </Button>
  );
}

export function AddLessonForm({ moduleId }: { moduleId: number }) {
  const fetcher = useFetcher();
  useFetcherToast(fetcher, "Lesson added.");
  const form = useAddForm(fetcher, (title) =>
    fetcher.submit(
      { intent: "add-lesson", moduleId: String(moduleId), title },
      { method: "post" }
    )
  );

  if (!form.isAdding) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={form.open}
        className="mt-2 text-muted-foreground"
      >
        <Plus className="mr-1 size-3.5" />
        Add Lesson
      </Button>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <Input
        ref={form.inputRef}
        type="text"
        placeholder="Lesson title..."
        value={form.title}
        onChange={(event) => form.setTitle(event.target.value)}
        onKeyDown={form.onKeyDown}
        className="max-w-xs text-sm"
      />
      <Button
        size="sm"
        className="h-8"
        onClick={form.submit}
        disabled={!form.title.trim()}
      >
        Add
      </Button>
      <Button variant="ghost" size="sm" className="h-8" onClick={form.close}>
        Cancel
      </Button>
    </div>
  );
}
