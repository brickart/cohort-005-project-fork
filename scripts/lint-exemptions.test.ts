import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { z } from "zod";

// The size-limit exemptions in .oxlintrc.json are legacy: files that were
// already too big when the limits arrived. The list only shrinks. A new file
// that breaks a limit gets split, and a file split out of an exempt one does
// not inherit its exemption. lint-exemptions.baseline.json is the frozen list;
// delete entries from both files as they are split, and never add one.

const SIZE_RULES = [
  "max-lines",
  "max-lines-per-function",
  "max-params",
  "max-depth",
] as const;

const configSchema = z.object({
  overrides: z.array(
    z.object({
      files: z.array(z.string()),
      rules: z.record(z.unknown()),
    })
  ),
});

const baselineSchema = z.record(z.array(z.string()));

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

// .oxlintrc.json has comments, which JSON.parse rejects. TypeScript's config
// parser reads the same JSONC dialect as tsconfig.json.
function readOxlintConfig() {
  const { config, error } = ts.parseConfigFileTextToJson(
    ".oxlintrc.json",
    read(".oxlintrc.json")
  );
  if (error) throw new Error(String(error.messageText));
  return configSchema.parse(config);
}

function exemptFiles(rule: string): string[] {
  return readOxlintConfig()
    .overrides.filter(({ rules }) => rules[rule] === "off")
    .flatMap(({ files }) => files)
    .filter((file) => !file.includes("*"));
}

describe("size-limit exemptions in .oxlintrc.json", () => {
  const baseline = baselineSchema.parse(
    JSON.parse(read("scripts/lint-exemptions.baseline.json"))
  );

  it.each(SIZE_RULES)("%s only exempts files on the frozen list", (rule) => {
    const added = exemptFiles(rule).filter(
      (file) => !(baseline[rule] ?? []).includes(file)
    );
    expect(
      added,
      `Split these files until they meet ${rule} instead of exempting them`
    ).toEqual([]);
  });
});
