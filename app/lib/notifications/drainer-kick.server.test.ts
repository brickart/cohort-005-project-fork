import { describe, expect, it } from "vitest";
import { kickDrainerAfterWrites } from "./drainer-kick.server";

// Every request that can write kicks the drainer once its action has finished
// (and so its transaction has committed), so no notifying action can forget.

function request(method: string) {
  return new Request("http://cadence.test/courses/intro", { method });
}

describe("kicking the drainer after a write", () => {
  it("kicks after the action has answered, not before", async () => {
    const events: string[] = [];
    const middleware = kickDrainerAfterWrites(() => events.push("kick"));

    const response = await middleware(
      { request: request("POST") },
      async () => {
        events.push("action");
        return new Response("done");
      }
    );

    expect(events).toEqual(["action", "kick"]);
    expect(await response.text()).toBe("done");
  });

  it("does not kick for reads", async () => {
    let kicks = 0;
    const middleware = kickDrainerAfterWrites(() => kicks++);

    for (const method of ["GET", "HEAD"]) {
      await middleware(
        { request: request(method) },
        async () => new Response()
      );
    }

    expect(kicks).toBe(0);
  });

  it("still kicks when the action throws, since it may have committed first", async () => {
    let kicks = 0;
    const middleware = kickDrainerAfterWrites(() => kicks++);

    await expect(
      middleware({ request: request("POST") }, async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    expect(kicks).toBe(1);
  });
});
