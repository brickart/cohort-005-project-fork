import { existsSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Every deep module under app/modules/ ships with tests in its own tests/
// folder, written against its entry points. A module without them is a seam
// nobody checks. See app/modules/README.md.

const modulesRoot = new URL("../app/modules/", import.meta.url);

const modules = readdirSync(modulesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

function testFiles(module: string): string[] {
  const tests = new URL(`${module}/tests/`, modulesRoot);
  if (!existsSync(tests)) return [];
  return readdirSync(tests, { recursive: true, encoding: "utf8" }).filter(
    (file) => /\.test\.tsx?$/.test(file)
  );
}

describe("app/modules", () => {
  it.each(modules)("%s has tests in its tests/ folder", (module) => {
    expect(
      testFiles(module),
      `Add app/modules/${module}/tests/<name>.test.ts`
    ).not.toEqual([]);
  });
});
