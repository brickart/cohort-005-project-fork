import { describe, expect, it } from "vitest";
import type { ShouldRevalidateFunctionArgs } from "react-router";
import { searchOnlyNavigation } from "./revalidation";

function args(
  current: string,
  next: string,
  formMethod?: "POST"
): ShouldRevalidateFunctionArgs {
  return {
    currentUrl: new URL(current, "http://localhost"),
    nextUrl: new URL(next, "http://localhost"),
    currentParams: {},
    nextParams: {},
    formMethod,
    defaultShouldRevalidate: true,
  };
}

describe("searchOnlyNavigation", () => {
  it("skips the loader when only the query string changes", () => {
    expect(
      searchOnlyNavigation(args("/instructor/1", "/instructor/1?q=ada"))
    ).toBe(false);
  });

  it("revalidates after an action on the same page", () => {
    expect(
      searchOnlyNavigation(args("/instructor/1", "/instructor/1", "POST"))
    ).toBe(true);
  });

  it("revalidates on a move to another page", () => {
    expect(searchOnlyNavigation(args("/instructor/1", "/instructor/2"))).toBe(
      true
    );
  });

  it("revalidates on a navigation to the same URL", () => {
    expect(
      searchOnlyNavigation(args("/instructor/1?q=ada", "/instructor/1?q=ada"))
    ).toBe(true);
  });
});
