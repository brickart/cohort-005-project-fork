export type Box = { left: number; top: number; width: number; height: number };

/** A point as fractions of the frame, the unit canvas-confetti takes. */
export type Origin = { x: number; y: number };

export type BurstOptions = {
  origin: Origin;
  particleCount: number;
  spread: number;
  startVelocity: number;
};

export type Fire = (options: BurstOptions) => void;

/**
 * The centre of `target` as fractions of `frame`. The frame is the content
 * area, not the window, so the sidebar does not pull the burst off-centre.
 */
export function centreOf(target: Box, frame: Box): Origin {
  return {
    x: (target.left + target.width / 2 - frame.left) / frame.width,
    y: (target.top + target.height / 2 - frame.top) / frame.height,
  };
}

/**
 * Bursts confetti out from behind the centre of `target`: one fountain
 * upwards and one ring all round, fast enough to clear the card's edges.
 */
export function celebrate({
  target,
  frame,
  fire,
  prefersReducedMotion,
}: {
  target: Box;
  frame: Box;
  fire: Fire;
  prefersReducedMotion: boolean;
}): void {
  if (prefersReducedMotion) return;
  const origin = centreOf(target, frame);
  fire({ origin, particleCount: 120, spread: 100, startVelocity: 55 });
  fire({ origin, particleCount: 80, spread: 360, startVelocity: 40 });
}
