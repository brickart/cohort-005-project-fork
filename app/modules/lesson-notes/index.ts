import {
  describeDraft,
  describeSave,
  type NoteDraft,
  type SaveResponse,
  type SaveStatus,
} from "./lib/draft";

export type { NoteDraft, SaveResponse, SaveStatus };

/**
 * What the Lesson page's Note editor shows. The server
 * (`~/lib/notes.server`) stays the authority on what gets stored; this only
 * keeps the Student from posting a draft the server would refuse.
 */
export function noteDraft(body: string): NoteDraft {
  return describeDraft(body);
}

/** The line beside the Save button: saving, saved, or why it failed. */
export function noteSaveStatus(
  submitting: boolean,
  response: SaveResponse,
  editedSinceSave: boolean
): SaveStatus {
  return describeSave(submitting, response, editedSinceSave);
}
