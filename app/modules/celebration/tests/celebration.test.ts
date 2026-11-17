import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { celebrate, useConfetti } from "../index";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function mediaMatching(matchingQuery: string | null) {
  return vi.fn((query: string) => ({ matches: query === matchingQuery }));
}

function fakeConfetti() {
  const confetti = vi.fn();
  const load = vi.fn(async () => confetti);
  return { confetti, load };
}

describe("celebrate", () => {
  it("bursts confetti when the person has no reduced-motion preference", async () => {
    const { confetti, load } = fakeConfetti();
    expect(await celebrate(mediaMatching(null), load)).toBe(true);
    expect(confetti).toHaveBeenCalledOnce();
    expect(confetti).toHaveBeenCalledWith({
      particleCount: 150,
      spread: 90,
      origin: { y: 0.6 },
    });
  });

  it("skips the confetti, and never loads it, for reduced motion", async () => {
    const { confetti, load } = fakeConfetti();
    const matchMedia = mediaMatching(REDUCED_MOTION);
    expect(await celebrate(matchMedia, load)).toBe(false);
    expect(matchMedia).toHaveBeenCalledWith(REDUCED_MOTION);
    expect(load).not.toHaveBeenCalled();
    expect(confetti).not.toHaveBeenCalled();
  });

  it("bursts again on every call, so every visit celebrates", async () => {
    const { confetti, load } = fakeConfetti();
    await celebrate(mediaMatching(null), load);
    await celebrate(mediaMatching(null), load);
    expect(confetti).toHaveBeenCalledTimes(2);
  });
});

describe("useConfetti", () => {
  it("does nothing during the server render", () => {
    function Page() {
      useConfetti();
      return createElement("p", null, "ok");
    }
    expect(renderToString(createElement(Page))).toBe("<p>ok</p>");
  });
});
