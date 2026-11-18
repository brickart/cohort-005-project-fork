import type { ShouldRevalidateFunctionArgs } from "react-router";

/**
 * A `shouldRevalidate` for pages whose search params only change what the
 * browser shows: skip the loader when nothing but the query string changed.
 * Actions, moves to another page and a navigation to the same URL (a link
 * to the page you are on) revalidate as usual.
 */
export function searchOnlyNavigation({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs): boolean {
  const onlySearchChanged =
    currentUrl.pathname === nextUrl.pathname &&
    currentUrl.search !== nextUrl.search;
  if (!formMethod && onlySearchChanged) return false;
  return defaultShouldRevalidate;
}
