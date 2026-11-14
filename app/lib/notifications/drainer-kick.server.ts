// ─── Kicking the drainer after a write ───
// Actions that enqueue Notifications commit their transaction before they
// answer. The root route runs this middleware, so every request that can
// write kicks the drainer once the action is done: a new notifying action
// can't forget, and the kick never happens inside a transaction. A write that
// enqueued nothing costs one cheap outbox query.

const READS = new Set(["GET", "HEAD", "OPTIONS"]);

type Middleware = (
  args: { request: Request },
  next: () => Promise<Response>
) => Promise<Response>;

export function kickDrainerAfterWrites(kick: () => void): Middleware {
  return async ({ request }, next) => {
    if (READS.has(request.method.toUpperCase())) return next();
    try {
      return await next();
    } finally {
      kick();
    }
  };
}
