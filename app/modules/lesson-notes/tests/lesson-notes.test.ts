import { describe, it, expect } from "vitest";
import { noteDraft, noteSaveStatus } from "../index";
import { MAX_NOTE_LENGTH } from "~/lib/notes";

describe("noteDraft", () => {
  it("cannot save an empty draft", () => {
    expect(noteDraft("")).toEqual({
      length: 0,
      max: MAX_NOTE_LENGTH,
      empty: true,
      tooLong: false,
      canSave: false,
    });
  });

  it("treats whitespace alone as empty, as the server does", () => {
    const draft = noteDraft("   \n\t ");
    expect(draft.empty).toBe(true);
    expect(draft.length).toBe(0);
    expect(draft.canSave).toBe(false);
  });

  it("counts the trimmed characters", () => {
    const draft = noteDraft("  generics  ");
    expect(draft.length).toBe(8);
    expect(draft.empty).toBe(false);
    expect(draft.canSave).toBe(true);
  });

  it("can save a draft of exactly the maximum length", () => {
    const draft = noteDraft("a".repeat(MAX_NOTE_LENGTH));
    expect(draft.tooLong).toBe(false);
    expect(draft.canSave).toBe(true);
  });

  it("cannot save a draft one character over the maximum", () => {
    const draft = noteDraft("a".repeat(MAX_NOTE_LENGTH + 1));
    expect(draft.length).toBe(MAX_NOTE_LENGTH + 1);
    expect(draft.tooLong).toBe(true);
    expect(draft.canSave).toBe(false);
  });

  it("does not count surrounding whitespace towards the maximum", () => {
    const draft = noteDraft(` ${"a".repeat(MAX_NOTE_LENGTH)} `);
    expect(draft.tooLong).toBe(false);
  });
});

describe("noteSaveStatus", () => {
  it("is idle before anything is saved", () => {
    expect(
      noteSaveStatus({
        submitting: false,
        response: undefined,
        editedSinceSave: false,
      })
    ).toEqual({ kind: "idle" });
  });

  it("is saving while the request is in flight, whatever came before", () => {
    expect(
      noteSaveStatus({
        submitting: true,
        response: undefined,
        editedSinceSave: false,
      })
    ).toEqual({ kind: "saving" });
    expect(
      noteSaveStatus({
        submitting: true,
        response: { ok: true },
        editedSinceSave: true,
      })
    ).toEqual({
      kind: "saving",
    });
  });

  it("is saved after the server accepts the note", () => {
    expect(
      noteSaveStatus({
        submitting: false,
        response: { ok: true },
        editedSinceSave: false,
      })
    ).toEqual({
      kind: "saved",
    });
  });

  it("stops saying saved once the Student edits again", () => {
    expect(
      noteSaveStatus({
        submitting: false,
        response: { ok: true },
        editedSinceSave: true,
      })
    ).toEqual({
      kind: "idle",
    });
  });

  it("shows the server's error", () => {
    expect(
      noteSaveStatus({
        submitting: false,
        response: { ok: false, error: "Too long" },
        editedSinceSave: false,
      })
    ).toEqual({ kind: "error", message: "Too long" });
  });

  it("falls back to a generic error when the server gives none", () => {
    expect(
      noteSaveStatus({
        submitting: false,
        response: { ok: false },
        editedSinceSave: false,
      })
    ).toEqual({
      kind: "error",
      message: "Your note was not saved. Try again.",
    });
  });

  it("clears an error once the Student edits again", () => {
    expect(
      noteSaveStatus({
        submitting: false,
        response: { ok: false, error: "Too long" },
        editedSinceSave: true,
      })
    ).toEqual({ kind: "idle" });
  });
});
