/**
 * A copy of `current` with each change applied. A change back to its default
 * removes the param, so the default view keeps a clean URL.
 */
export function withSearchParams<T extends Record<string, string>>(
  current: URLSearchParams,
  changes: Partial<T>,
  defaults: T
): URLSearchParams {
  const next = new URLSearchParams(current);
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) continue;
    if (value === defaults[key]) next.delete(key);
    else next.set(key, value);
  }
  return next;
}
