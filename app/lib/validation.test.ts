import { describe, expect, it } from "vitest";
import { z } from "zod";
import { idParam, parseParams } from "./validation";

const schema = z.object({ lessonId: idParam });

function thrownBy(run: () => unknown) {
  try {
    run();
  } catch (thrown) {
    return thrown;
  }
  throw new Error("expected a throw");
}

function responseOf(thrown: unknown) {
  // `data()` throws a DataWithResponseInit, not a Response.
  const { type, data, init } = thrown as {
    type: string;
    data: unknown;
    init: { status: number } | null;
  };
  return { type, data, status: init?.status };
}

describe("parseParams", () => {
  it("returns the coerced id and drops the other params", () => {
    expect(parseParams({ lessonId: "12", slug: "ts" }, schema)).toEqual({
      lessonId: 12,
    });
  });

  it.each(["", "0", "-1", "1.5", "abc", undefined])(
    "rejects %j with a 400 by default",
    (lessonId) => {
      const thrown = thrownBy(() => parseParams({ lessonId }, schema));
      expect(responseOf(thrown)).toEqual({
        type: "DataWithResponseInit",
        data: "Invalid parameters",
        status: 400,
      });
    }
  );

  it("rejects with a 404 and the route's message when given notFound", () => {
    const thrown = thrownBy(() =>
      parseParams({ lessonId: "" }, schema, { notFound: "Lesson not found" })
    );
    expect(responseOf(thrown)).toEqual({
      type: "DataWithResponseInit",
      data: "Lesson not found",
      status: 404,
    });
  });
});
