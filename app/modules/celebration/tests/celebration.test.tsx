import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ConfettiStage,
  celebrate,
  centreOf,
  type BurstOptions,
} from "../index";

const contentArea = { left: 256, top: 0, width: 1184, height: 900 };
const card = { left: 512, top: 300, width: 672, height: 300 };

describe("centreOf", () => {
  it("measures the card's centre from the content area, not the window", () => {
    expect(centreOf(card, contentArea)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("follows a card that sits off-centre", () => {
    const frame = { left: 100, top: 50, width: 1000, height: 500 };
    const target = { left: 200, top: 100, width: 200, height: 100 };
    expect(centreOf(target, frame)).toEqual({ x: 0.2, y: 0.2 });
  });
});

describe("celebrate", () => {
  function run(prefersReducedMotion: boolean) {
    const bursts: BurstOptions[] = [];
    const fired = celebrate({
      target: card,
      frame: contentArea,
      fire: (options) => bursts.push(options),
      prefersReducedMotion,
    });
    return { fired, bursts };
  }

  it("bursts from the centre of the card", () => {
    const { fired, bursts } = run(false);
    expect(fired).toBe(true);
    expect(bursts.length).toBeGreaterThan(0);
    for (const burst of bursts) {
      expect(burst.origin).toEqual({ x: 0.5, y: 0.5 });
      expect(burst.particleCount).toBeGreaterThan(0);
    }
  });

  it("sends some confetti all the way round the card", () => {
    const { bursts } = run(false);
    expect(bursts.some((b) => b.spread === 360)).toBe(true);
  });

  it("fires nothing for a Student who prefers reduced motion", () => {
    expect(run(true)).toEqual({ fired: false, bursts: [] });
  });
});

describe("ConfettiStage", () => {
  const html = renderToStaticMarkup(
    <ConfettiStage>
      <p>Welcome!</p>
    </ConfettiStage>
  );

  it("centres its children in the content area", () => {
    expect(html).toMatch(
      /^<div class="[^"]*\bmin-h-full\b[^"]*\bitems-center\b[^"]*\bjustify-center\b/
    );
  });

  it("draws the confetti on a canvas beneath the children", () => {
    const canvasAt = html.indexOf("<canvas");
    expect(canvasAt).toBeGreaterThan(-1);
    expect(canvasAt).toBeLessThan(html.indexOf("Welcome!"));
    expect(html).toMatch(
      /<canvas aria-hidden="true" class="pointer-events-none/
    );
    expect(html).toMatch(/<div class="relative w-full"><p>Welcome!<\/p>/);
  });
});
