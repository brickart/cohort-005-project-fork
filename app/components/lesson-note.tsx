import { useState } from "react";
import { useFetcher } from "react-router";
import { CheckCircle2, Lock, NotebookPen } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Textarea } from "~/components/ui/textarea";
import { cn, formatRelativeTime } from "~/lib/utils";
import {
  noteDraft,
  noteSaveStatus,
  type NoteDraft,
  type SaveResponse,
  type SaveStatus,
} from "~/modules/lesson-notes";

export type LessonNoteData = { body: string; updatedAt: string } | null;

/**
 * The Student's private Note on a Lesson. It sits directly above the
 * Discussion card and mirrors its layout, but stays a separate card with a
 * privacy badge: a Note is addressed to nobody, and a private thought typed
 * into the public box cannot be taken back.
 */
export function LessonNote({ note }: { note: LessonNoteData }) {
  const fetcher = useFetcher<SaveResponse>();
  const [body, setBody] = useState(note?.body ?? "");
  const [submittedBody, setSubmittedBody] = useState<string | null>(null);

  const draft = noteDraft(body);
  const status = noteSaveStatus({
    submitting: fetcher.state !== "idle",
    response: fetcher.data,
    editedSinceSave: body !== submittedBody,
  });

  return (
    <Card className="mb-8">
      <CardContent className="p-6">
        <NoteHeader />
        <fetcher.Form
          method="post"
          className="space-y-3"
          onSubmit={() => setSubmittedBody(body)}
        >
          <input type="hidden" name="intent" value="save-note" />
          <Textarea
            name="body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Jot down what you want to remember from this lesson."
            aria-label="Your private note on this lesson"
            className="min-h-36 resize-y"
          />
          <NoteFooter draft={draft} status={status} note={note} />
        </fetcher.Form>
      </CardContent>
    </Card>
  );
}

function NoteHeader() {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <NotebookPen className="size-5 text-primary" />
      <h2 className="text-xl font-semibold">Your notes</h2>
      <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
        <Lock className="size-3" />
        Only you can see this
      </span>
    </div>
  );
}

function NoteFooter({
  draft,
  status,
  note,
}: {
  draft: NoteDraft;
  status: SaveStatus;
  note: LessonNoteData;
}) {
  const saving = status.kind === "saving";
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="submit" size="sm" disabled={saving || !draft.canSave}>
        {saving ? "Saving..." : "Save note"}
      </Button>
      <output className="text-sm">
        <SaveMessage status={status} note={note} />
      </output>
      <span
        className={cn(
          "ml-auto text-xs",
          draft.tooLong ? "text-destructive" : "text-muted-foreground"
        )}
      >
        {draft.length} / {draft.max}
      </span>
    </div>
  );
}

function SaveMessage({
  status,
  note,
}: {
  status: SaveStatus;
  note: LessonNoteData;
}) {
  if (status.kind === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400">
        <CheckCircle2 className="size-4" />
        Saved
      </span>
    );
  }
  if (status.kind === "error") {
    return <span className="text-destructive">{status.message}</span>;
  }
  if (!note) return null;
  return (
    <span suppressHydrationWarning className="text-xs text-muted-foreground">
      Last edited {formatRelativeTime(note.updatedAt)}
    </span>
  );
}
