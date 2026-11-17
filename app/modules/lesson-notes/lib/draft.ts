import { MAX_NOTE_LENGTH } from "~/lib/notes";

export type NoteDraft = {
  /** Characters that would be saved: the server trims before it stores. */
  length: number;
  max: number;
  empty: boolean;
  tooLong: boolean;
  canSave: boolean;
};

export function describeDraft(body: string): NoteDraft {
  const length = body.trim().length;
  const empty = length === 0;
  const tooLong = length > MAX_NOTE_LENGTH;
  return {
    length,
    max: MAX_NOTE_LENGTH,
    empty,
    tooLong,
    canSave: !empty && !tooLong,
  };
}

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

export type SaveResponse = { ok: boolean; error?: string } | undefined;

/**
 * "Saved" lasts only until the Student edits the draft again; after that the
 * page no longer holds what the server stored.
 */
export function describeSave(
  submitting: boolean,
  response: SaveResponse,
  editedSinceSave: boolean
): SaveStatus {
  if (submitting) return { kind: "saving" };
  if (!response || editedSinceSave) return { kind: "idle" };
  if (response.ok) return { kind: "saved" };
  return {
    kind: "error",
    message: response.error ?? "Your note was not saved. Try again.",
  };
}
