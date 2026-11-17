import { useEffect, useRef, type ReactNode } from "react";
import { celebrate, centreOf, type Box, type BurstOptions } from "./lib/burst";

export type { Box, BurstOptions };
export { celebrate, centreOf };

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/**
 * Centres `children` in the content area and bursts confetti from behind
 * them on every mount. The confetti draws on a canvas of its own beneath
 * the children, so it never covers the card or the sidebar.
 */
export function ConfettiStage({ children }: { children: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const target = targetRef.current;
    if (!canvas || !target) return;
    let reset: (() => void) | undefined;
    let cancelled = false;

    // canvas-confetti reads `window` when it loads, so it loads here, in the
    // browser, and stays out of the server bundle.
    import("canvas-confetti").then(({ default: confetti }) => {
      if (cancelled) return;
      const fire = confetti.create(canvas, { resize: true });
      reset = () => fire.reset();
      celebrate({
        target: target.getBoundingClientRect(),
        frame: canvas.getBoundingClientRect(),
        fire: (options) => void fire(options),
        prefersReducedMotion: window.matchMedia(REDUCED_MOTION).matches,
      });
    });

    return () => {
      cancelled = true;
      reset?.();
    };
  }, []);

  return (
    <div className="relative flex min-h-full items-center justify-center">
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full"
      />
      <div ref={targetRef} className="relative w-full">
        {children}
      </div>
    </div>
  );
}
