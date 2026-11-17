import { useEffect } from "react";
import { celebrate, type LoadConfetti } from "./lib/celebration";

export { celebrate };

// Imported on demand so canvas-confetti never runs in the server render and
// stays out of the page's initial bundle.
const loadCanvasConfetti: LoadConfetti = async () =>
  (await import("canvas-confetti")).default;

export function useConfetti(): void {
  useEffect(() => {
    void celebrate((query) => window.matchMedia(query), loadCanvasConfetti);
  }, []);
}
