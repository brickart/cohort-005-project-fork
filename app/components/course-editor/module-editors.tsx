import { useState } from "react";
import { useFetcher } from "react-router";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useFetcherToast } from "./use-fetcher-toast";
import { useInlineEdit, isEnter } from "./use-inline-edit";
import { useAddForm } from "./use-add-form";
import { ConfirmDeletePrompt } from "./confirm-delete-prompt";

export function InlineEditableModuleTitle({
  value,
  moduleId,
}: {
  value: string;
  moduleId: number;
}) {
  const fetcher = useFetcher();
  const edit = useInlineEdit<HTMLInputElement>({
    value,
    isSaveKey: isEnter,
    onCommit: (title) =>
      fetcher.submit(
        { intent: "rename-module", moduleId: String(moduleId), title },
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
        className="w-full rounded-md border border-input bg-background px-2 py-1 text-base font-semibold outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={edit.startEditing}
      className="group flex items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-muted"
    >
      <h3 className="font-semibold">{value}</h3>
      <Pencil className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

export function DeleteModuleButton({
  moduleId,
  moduleTitle,
}: {
  moduleId: number;
  moduleTitle: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const fetcher = useFetcher();
  useFetcherToast(fetcher, "Module deleted.");

  if (confirming) {
    return (
      <ConfirmDeletePrompt
        label={`Delete "${moduleTitle}"?`}
        buttonClassName="h-7 text-xs"
        onConfirm={() => {
          fetcher.submit(
            { intent: "delete-module", moduleId: String(moduleId) },
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
      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
      onClick={() => setConfirming(true)}
    >
      <Trash2 className="size-4" />
    </Button>
  );
}

export function AddModuleForm() {
  const fetcher = useFetcher();
  useFetcherToast(fetcher, "Module added.");
  const form = useAddForm(fetcher, (title) =>
    fetcher.submit({ intent: "add-module", title }, { method: "post" })
  );

  if (!form.isAdding) {
    return (
      <Button variant="outline" size="sm" onClick={form.open} className="mt-4">
        <Plus className="mr-1.5 size-4" />
        Add Module
      </Button>
    );
  }

  return (
    <div className="mt-4 flex items-center gap-2">
      <Input
        ref={form.inputRef}
        type="text"
        placeholder="Module title..."
        value={form.title}
        onChange={(event) => form.setTitle(event.target.value)}
        onKeyDown={form.onKeyDown}
        className="max-w-xs"
      />
      <Button size="sm" onClick={form.submit} disabled={!form.title.trim()}>
        Add
      </Button>
      <Button variant="ghost" size="sm" onClick={form.close}>
        Cancel
      </Button>
    </div>
  );
}
