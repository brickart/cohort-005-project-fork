import { marked } from "marked";

// ─── The text the bell shows ───
// An In-app step's body is markdown, with user-supplied values escaped by
// `| escape`. Knock renders it to HTML; the bell shows plain text. Both
// NotificationServices go through here so the bell reads the same either way.

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Strips tags and decodes entities, as the bell shows plain text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
      if (name.startsWith("#x") || name.startsWith("#X")) {
        return String.fromCodePoint(parseInt(name.slice(2), 16));
      }
      if (name.startsWith("#")) {
        return String.fromCodePoint(parseInt(name.slice(1), 10));
      }
      return ENTITIES[name.toLowerCase()] ?? entity;
    })
    .trim();
}

/** A rendered In-app markdown body, as Knock's feed would give it back. */
export function markdownToText(markdown: string): string {
  return htmlToText(marked.parse(markdown, { async: false }));
}
