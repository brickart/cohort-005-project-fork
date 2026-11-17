import {
  describeDraft,
  describeSave,
  type NoteDraft,
  type SaveResponse,
  type SaveState,
  type SaveStatus,
} from "./lib/draft";

export type { NoteDraft, SaveResponse, SaveState, SaveStatus };

/**
 * What the Lesson page's Note editor shows. The server
 * (`~/lib/notes.server`) stays the authority on what gets stored; this only
 * keeps the Student from posting a draft the server would refuse.
 */
export function noteDraft(body: string): NoteDraft {
  return describeDraft(body);
}

/** The line beside the Save button: saving, saved, or why it failed. */
export function noteSaveStatus(state: SaveState): SaveStatus {
  return describeSave(state);
}
