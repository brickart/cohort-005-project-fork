import type { Options } from "canvas-confetti";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

type MatchMedia = (query: string) => { matches: boolean };
type Confetti = (options: Options) => unknown;
export type LoadConfetti = () => Promise<Confetti>;

const BURST: Options = {
  particleCount: 150,
  spread: 90,
  origin: { y: 0.6 },
};

export async function celebrate(
  matchMedia: MatchMedia,
  loadConfetti: LoadConfetti
): Promise<boolean> {
  if (matchMedia(REDUCED_MOTION_QUERY).matches) return false;
  const confetti = await loadConfetti();
  confetti(BURST);
  return true;
}
