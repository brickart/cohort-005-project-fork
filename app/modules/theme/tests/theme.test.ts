import { afterEach, describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import {
  readDocumentTheme,
  setDocumentTheme,
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
    classList: {
      contains: (c: string) => set.has(c),
      toggle: (c: string, force: boolean) => {
        if (force) set.add(c);
        else set.delete(c);
        return force;
      },
    },
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

function stubStorage() {
  const saved = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    setItem: (key: string, value: string) => saved.set(key, value),
  });
  return saved;
}

describe("setDocumentTheme", () => {
  it("switches <html> to dark and remembers it for the next load", () => {
    stubDocument();
    const saved = stubStorage();
    setDocumentTheme("dark");
    expect(readDocumentTheme()).toBe("dark");
    expect(saved.get("cadence-theme")).toBe("dark");
  });

  it("switches <html> back to light and remembers it", () => {
    stubDocument("dark");
    const saved = stubStorage();
    setDocumentTheme("light");
    expect(readDocumentTheme()).toBe("light");
    expect(saved.get("cadence-theme")).toBe("light");
  });

  it("still switches the theme when storage is unavailable", () => {
    stubDocument();
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("blocked");
      },
    });
    setDocumentTheme("dark");
    expect(readDocumentTheme()).toBe("dark");
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
