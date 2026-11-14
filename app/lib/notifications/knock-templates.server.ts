import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Hash,
  Liquid,
  Tag,
  type Context,
  type Emitter,
  type TagToken,
  type TopLevelToken,
} from "liquidjs";

// ─── Reading and rendering .knock/ ───
// Knock's workflows, step templates, layouts and partials live in .knock/ in
// the repo (pushed to Knock by CI). This module reads them, and renders them
// with liquidjs the way Knock would, so the local NotificationService and the
// consistency tests need no credentials. Known gaps compared with Knock: CSS
// inlining and the "Powered by Knock" footer.

const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_KNOCK_DIR = resolve(here, "../../../.knock");

// Steps are told apart by the refs the Knock CLI generates for them.
const EMAIL_STEP_REF = /^email_\d+$/;
const IN_APP_STEP_REF = /^in_app_feed_\d+$/;

type JsonObject = Record<string, unknown>;

function readJson(path: string): JsonObject {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${path} is not a JSON object`);
  }
  return parsed as JsonObject;
}

function asObject(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export type EmailStep = {
  subject: string;
  layoutKey: string;
  htmlBodyPath: string;
  textBodyPath: string;
};

export type InAppStep = {
  markdownBodyPath: string;
  actionUrl: string;
};

export type Workflow = {
  key: string;
  overridesPreferences: boolean;
  /** Knock preference categories, e.g. the shared Mute category. */
  categories: string[];
  email: EmailStep | null;
  inApp: InAppStep | null;
};

export function readWorkflow(
  key: string,
  knockDir: string = DEFAULT_KNOCK_DIR
): Workflow {
  const directory = join(knockDir, "workflows", key);
  const workflow = readJson(join(directory, "workflow.json"));
  const steps = Array.isArray(workflow.steps)
    ? workflow.steps.map(asObject)
    : [];
  const fileIn = (template: JsonObject, field: string) => {
    const relative = asString(template[`${field}@`]);
    return relative === null ? "" : join(directory, relative);
  };

  const emailStep = steps.find((step) =>
    EMAIL_STEP_REF.test(asString(step.ref) ?? "")
  );
  const inAppStep = steps.find((step) =>
    IN_APP_STEP_REF.test(asString(step.ref) ?? "")
  );

  let email: EmailStep | null = null;
  if (emailStep) {
    const template = asObject(emailStep.template);
    email = {
      subject: asString(template.subject) ?? "",
      layoutKey: asString(asObject(template.settings).layout_key) ?? "default",
      htmlBodyPath: fileIn(template, "html_body"),
      textBodyPath: fileIn(template, "text_body"),
    };
  }

  let inApp: InAppStep | null = null;
  if (inAppStep) {
    const template = asObject(inAppStep.template);
    inApp = {
      markdownBodyPath: fileIn(template, "markdown_body"),
      actionUrl: asString(template.action_url) ?? "",
    };
  }

  return {
    key,
    overridesPreferences:
      asObject(workflow.settings).override_recipient_preferences === true,
    categories: Array.isArray(workflow.categories)
      ? workflow.categories.filter(
          (category): category is string => typeof category === "string"
        )
      : [],
    email,
    inApp,
  };
}

// ─── Liquid ───

function createEngine(knockDir: string): Liquid {
  const engine = new Liquid({ strictVariables: true, strictFilters: true });

  // Knock's `{% render 'key', name: value %}`: renders
  // .knock/partials/<key>/ with only the arguments in scope. Replaces
  // liquidjs's own render tag, which would look for a file on disk.
  class PartialTag extends Tag {
    private readonly partialKey: string;
    private readonly args: Hash;

    constructor(token: TagToken, remain: TopLevelToken[], liquid: Liquid) {
      super(token, remain, liquid);
      const match = /^\s*["']([^"']+)["']\s*,?/.exec(token.args);
      if (!match) throw new Error(`Bad partial tag: ${token.args}`);
      this.partialKey = match[1];
      this.args = new Hash(token.args.slice(match[0].length));
    }

    *render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
      const args = (yield this.args.render(ctx)) as Record<string, unknown>;
      const directory = join(knockDir, "partials", this.partialKey);
      const partial = readJson(join(directory, "partial.json"));
      const content = readFileSync(
        join(directory, asString(partial["content@"]) ?? "content.html"),
        "utf8"
      );
      emitter.write(engine.parseAndRenderSync(content, args));
    }
  }

  engine.registerTag("render", PartialTag);
  return engine;
}

function scopeFor(data: Record<string, unknown>) {
  // Knock identifies the recipient inline from data.recipient, so in Knock
  // `recipient` is that same person.
  return { data, recipient: asObject(data.recipient) };
}

export type RenderedInApp = { body: string; actionUrl: string };

export function renderInApp(
  key: string,
  data: Record<string, unknown>,
  knockDir: string = DEFAULT_KNOCK_DIR
): RenderedInApp {
  const step = readWorkflow(key, knockDir).inApp;
  if (!step) throw new Error(`The ${key} workflow has no In-app step`);

  const engine = createEngine(knockDir);
  const scope = scopeFor(data);
  return {
    body: engine
      .parseAndRenderSync(readFileSync(step.markdownBodyPath, "utf8"), scope)
      .trim(),
    actionUrl: engine.parseAndRenderSync(step.actionUrl, scope).trim(),
  };
}

export type RenderedEmail = {
  subject: string;
  layout: string;
  /** The step's own HTML fragment, before the layout wraps it. */
  bodyHtml: string;
  html: string;
  text: string;
};

export function renderEmail(
  key: string,
  data: Record<string, unknown>,
  knockDir: string = DEFAULT_KNOCK_DIR
): RenderedEmail {
  const step = readWorkflow(key, knockDir).email;
  if (!step) throw new Error(`The ${key} workflow has no Email step`);

  const engine = createEngine(knockDir);
  const scope = scopeFor(data);
  const render = (template: string, extra: Record<string, unknown> = {}) =>
    engine.parseAndRenderSync(template, { ...scope, ...extra });

  const layoutDirectory = join(knockDir, "layouts", step.layoutKey);
  const layout = readJson(join(layoutDirectory, "layout.json"));
  const layoutFile = (field: string) =>
    readFileSync(
      join(layoutDirectory, asString(layout[`${field}@`]) ?? ""),
      "utf8"
    );

  const bodyHtml = render(readFileSync(step.htmlBodyPath, "utf8")).trim();
  const bodyText = render(readFileSync(step.textBodyPath, "utf8")).trim();

  return {
    subject: render(step.subject).trim(),
    layout: step.layoutKey,
    bodyHtml,
    html: render(layoutFile("html_layout"), { content: bodyHtml }),
    text: render(layoutFile("text_layout"), { content: bodyText }),
  };
}
