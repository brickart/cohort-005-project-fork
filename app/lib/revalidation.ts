import type { ShouldRevalidateFunctionArgs } from "react-router";

/**
 * A `shouldRevalidate` for pages whose search params only change what the
 * browser shows: skip the loader when nothing but the query string changed.
 * Actions and moves to another page revalidate as usual.
 */
export function searchOnlyNavigation({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs): boolean {
  if (!formMethod && currentUrl.pathname === nextUrl.pathname) return false;
  return defaultShouldRevalidate;
}
