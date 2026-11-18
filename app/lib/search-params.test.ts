import { describe, expect, it } from "vitest";
import { withSearchParams } from "./search-params";

describe("withSearchParams", () => {
  const defaults = { tab: "content", q: "" };

  it("sets a changed param and keeps the others", () => {
    const current = new URLSearchParams("q=ada&other=1");

    expect(
      withSearchParams(current, { tab: "students" }, defaults).toString()
    ).toBe("q=ada&other=1&tab=students");
  });

  it("drops a param changed back to its default", () => {
    const current = new URLSearchParams("tab=students&q=ada");

    expect(
      withSearchParams(current, { tab: "content", q: "" }, defaults).toString()
    ).toBe("");
  });

  it("leaves the params it was given alone", () => {
    const current = new URLSearchParams("q=ada");

    withSearchParams(current, { q: "" }, defaults);

    expect(current.toString()).toBe("q=ada");
  });

  it("ignores a change left undefined", () => {
    const current = new URLSearchParams("q=ada");

    expect(
      withSearchParams(current, { q: undefined }, defaults).toString()
    ).toBe("q=ada");
  });
});
