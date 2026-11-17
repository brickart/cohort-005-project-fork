import type { Options } from "canvas-confetti";

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export type MatchMedia = (query: string) => { matches: boolean };
export type Confetti = (options: Options) => unknown;
export type LoadConfetti = () => Promise<Confetti>;

export const BURST: Options = {
  particleCount: 150,
  spread: 90,
  origin: { y: 0.6 },
};

/**
 * Bursts confetti unless the person has asked for reduced motion. Returns
 * whether it fired.
 */
export async function celebrate(
  matchMedia: MatchMedia,
  loadConfetti: LoadConfetti
): Promise<boolean> {
  if (matchMedia(REDUCED_MOTION_QUERY).matches) return false;
  const confetti = await loadConfetti();
  confetti(BURST);
  return true;
}
