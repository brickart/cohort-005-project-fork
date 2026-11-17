import { useEffect } from "react";
import {
  celebrate,
  type Confetti,
  type LoadConfetti,
  type MatchMedia,
} from "./lib/celebration";

export { celebrate, type Confetti, type LoadConfetti, type MatchMedia };

// Imported on demand so canvas-confetti never runs in the server render and
// stays out of the page's initial bundle.
const loadCanvasConfetti: LoadConfetti = async () =>
  (await import("canvas-confetti")).default;

/**
 * Bursts confetti each time the calling component mounts, skipped for people
 * who prefer reduced motion.
 */
export function useConfetti(): void {
  useEffect(() => {
    void celebrate((query) => window.matchMedia(query), loadCanvasConfetti);
  }, []);
}
