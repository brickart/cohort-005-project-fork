import { afterEach, describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import {
  readDocumentTheme,
  subscribeToDocumentTheme,
  useTheme,
} from "../index";

class FakeObserver {
  static last: FakeObserver | undefined;
  observed: { target: unknown; options: MutationObserverInit } | undefined;
  disconnected = false;
  constructor(public callback: () => void) {
    FakeObserver.last = this;
  }
  observe(target: unknown, options: MutationObserverInit) {
    this.observed = { target, options };
  }
  disconnect() {
    this.disconnected = true;
  }
}

function stubDocument(...classes: string[]) {
  const set = new Set(classes);
  const documentElement = {
    classList: { contains: (c: string) => set.has(c) },
  };
  vi.stubGlobal("document", { documentElement });
  vi.stubGlobal("MutationObserver", FakeObserver);
  return documentElement;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readDocumentTheme", () => {
  it("is dark when <html> has the dark class", () => {
    stubDocument("dark");
    expect(readDocumentTheme()).toBe("dark");
  });

  it("is light when <html> has no dark class", () => {
    stubDocument();
    expect(readDocumentTheme()).toBe("light");
    stubDocument("darkish", "light");
    expect(readDocumentTheme()).toBe("light");
  });
});

describe("subscribeToDocumentTheme", () => {
  it("watches only the class attribute of <html>", () => {
    const html = stubDocument();
    subscribeToDocumentTheme(() => {});
    expect(FakeObserver.last?.observed).toEqual({
      target: html,
      options: { attributes: true, attributeFilter: ["class"] },
    });
  });

  it("calls back when the class changes", () => {
    stubDocument();
    let calls = 0;
    subscribeToDocumentTheme(() => calls++);
    FakeObserver.last?.callback();
    expect(calls).toBe(1);
  });

  it("stops watching when unsubscribed", () => {
    stubDocument();
    const unsubscribe = subscribeToDocumentTheme(() => {});
    expect(FakeObserver.last?.disconnected).toBe(false);
    unsubscribe();
    expect(FakeObserver.last?.disconnected).toBe(true);
  });
});

describe("useTheme", () => {
  it("renders light on the server, where there is no document", () => {
    function Probe() {
      return createElement("span", null, useTheme());
    }
    expect(renderToString(createElement(Probe))).toBe("<span>light</span>");
  });
});
