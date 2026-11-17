import { afterEach, describe, expect, it, vi } from "vitest";

// A separate file from celebration.test.ts: the server-render test there
// needs the real useEffect, and this one replaces it to run the effect
// without a DOM.
const { effects, confetti } = vi.hoisted(() => ({
  effects: [] as { run: () => void; deps: unknown[] | undefined }[],
  confetti: vi.fn(),
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useEffect: (run: () => void, deps?: unknown[]) => {
    effects.push({ run, deps });
  },
}));

vi.mock("canvas-confetti", () => ({ default: confetti }));

import { useConfetti } from "../index";

function stubReducedMotion(reduce: boolean) {
  const matchMedia = vi.fn((query: string) => ({
    matches: reduce && query === "(prefers-reduced-motion: reduce)",
  }));
  vi.stubGlobal("window", { matchMedia });
  return matchMedia;
}

afterEach(() => {
  effects.length = 0;
  confetti.mockClear();
  vi.unstubAllGlobals();
});

describe("useConfetti in the browser", () => {
  it("bursts confetti once, on mount", async () => {
    const matchMedia = stubReducedMotion(false);
    useConfetti();

    expect(effects).toHaveLength(1);
    expect(effects[0].deps).toEqual([]);

    effects[0].run();
    await vi.waitFor(() => expect(confetti).toHaveBeenCalledOnce());
    expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
  });

  it("skips the burst when the browser asks for reduced motion", async () => {
    stubReducedMotion(true);
    useConfetti();
    effects[0].run();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(confetti).not.toHaveBeenCalled();
  });
});
