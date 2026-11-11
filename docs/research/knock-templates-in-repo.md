# Can Knock workflows, templates and layouts live in the repo?

Research note for the ticket "Can Knock workflows, templates and layouts live in the repo?". Researched 2026-11-11 against Knock's docs (source: `knocklabs/docs` at `9bba98e`, 2026-11-10), the Knock CLI (`knocklabs/knock-cli` v1.6.1 README and source), the Management API OpenAPI spec (`knocklabs/docs` `data/specs/mapi/openapi.yml`), the public API spec (`data/specs/api/openapi.yml`) and the [pricing page](https://knock.app/pricing).

**Short answer:** yes. Every piece Cadence needs (workflows with their Email and In-app step templates, a custom email layout, partials, translations) can be pulled into a `.knock/` directory as JSON plus extracted `.html` / `.txt` / `.md` files, and pushed back with `knock push --commit` using a service token. Promotion is `knock commit promote --to=production`. The CLI and Management API are on every plan, Free included. Branding, channel configuration and the email provider are account-level settings and stay in the dashboard. Two limits matter: Knock-rendered output can't be produced locally without credentials, and the "Powered by Knock" email branding can only be removed on Starter ($250/month) or above. That second point contradicts the claim in `knock-email-provider.md` that the branding only shows in the prebuilt feed.

---

## 1. What the CLI can pull and push

### Resources

`knock pull` / `knock push` move "all resources" between an environment and a local directory ([README `knock pull`](https://github.com/knocklabs/knock-cli/blob/v1.6.1/README.md), [src/commands/pull.ts](https://github.com/knocklabs/knock-cli/blob/v1.6.1/src/commands/pull.ts)). Per-resource `pull` / `push` / `validate` commands exist for:

| Resource | Command group | Version-controlled (needs commit) |
| --- | --- | --- |
| Workflows, including every step and each channel step's template | `knock workflow` | Yes |
| Email layouts | `knock layout` | Yes |
| Partials (HTML, markdown, plaintext, JSON) | `knock partial` | Yes |
| Translations | `knock translation` | Yes |
| Message types, guides, reusable requests, audiences, goals | own groups | Yes |
| Variables (`vars.*`) | `knock variable pull/push/set` | No (account-level) |
| Schemas | `knock schema pull/push` | n/a |

The version-controlled list (workflows, guides, layouts, partials, translations, reusable requests) comes from [Environments: create content in environments](https://docs.knock.app/version-control/environments). The CLI's `--resource-type` options on `knock commit` are `audience|partial|email_layout|reusable_request|workflow|message_type|guide|translation` ([README `knock commit`](https://github.com/knocklabs/knock-cli/blob/v1.6.1/README.md)).

**Not in the repo:** "Channel configurations, branding, and variables do not need to be committed, as they live at the account level" ([Commits](https://docs.knock.app/version-control/commits)). The CLI has `knock channel list` but no channel push, so the Postmark (or other) email channel is configured in the dashboard. Logo, icon and brand colours (`vars.branding.*`) are set under Settings > Branding ([Branding](https://docs.knock.app/template-editor/branding)). A custom layout can hard-code its own logo and colours instead of reading `vars.branding`, which removes that dependency.

### File format

The project file `knock.json` sets the directory, for example `{"knockDir": ".knock"}` ([CLI overview](https://docs.knock.app/cli/overview)). Directory layouts:

```
.knock/
├── workflows/<workflow-key>/
│   ├── workflow.json            # all steps; templates reference extracted files
│   ├── email_1/html_body.html   # or visual_blocks.json + visual_blocks/*.md
│   ├── email_1/text_body.txt    # optional, see section 3
│   └── in_app_feed_1/markdown_body.md
├── layouts/<layout-key>/
│   ├── layout.json
│   ├── html_layout.html         # html_layout.mjml for MJML layouts
│   └── text_layout.txt
├── partials/<key>/partial.json + content.{html,md,txt,json}
└── translations/...
```

Sources: [Workflow file structure](https://docs.knock.app/cli/workflow/file-structure), [Layout file structure](https://docs.knock.app/cli/email-layout/file-structure), [Partial file structure](https://docs.knock.app/cli/partial). A field whose key ends in `@` holds a relative path to a file containing that field's content (`FILEPATH_MARKER = "@"` in [shared/const.isomorphic.ts](https://github.com/knocklabs/knock-cli/blob/v1.6.1/src/lib/marshal/shared/const.isomorphic.ts)). The layout example from the docs:

```json
{
  "key": "custom-layout",
  "name": "Custom Layout",
  "html_layout@": "html_layout.html",
  "text_layout@": "text_layout.txt",
  "footer_links": [{ "text": "My link", "url": "https://example.com" }]
}
```

The CLI's own scaffold for an Email step writes `template: { settings: { layout_key: "default" }, subject: "...", "html_body@": "email_1/html_body.html" }`. The In-app step gets `template: { action_url: "...", "markdown_body@": "in_app_feed_1/markdown_body.md" }` ([workflow/generator.ts](https://github.com/knocklabs/knock-cli/blob/v1.6.1/src/lib/marshal/workflow/generator.ts)). `workflow.json` follows the [Workflow mAPI schema](https://docs.knock.app/mapi-reference/workflows/schemas/workflow). Hand-written files can be pushed with `knock workflow push --all` ([Workflow file structure](https://docs.knock.app/cli/workflow/file-structure)).

`knock workflow generate-types --output-file=<file>.ts` generates TypeScript types for each workflow's trigger data ([README](https://github.com/knocklabs/knock-cli/blob/v1.6.1/README.md)). It needs a service token.

### Commit and promote

- `knock push --commit -m "<msg>"` pushes and commits in one step. A push without `--commit` leaves an uncommitted draft, and "saved changes ... do not apply to workflow runs ... invoked through the API" ([Commits](https://docs.knock.app/version-control/commits)). Layouts "must be committed before they appear in email notifications" ([Email layouts](https://docs.knock.app/integrations/email/layouts)).
- `knock commit promote --to=production` promotes all changes from the preceding environment. `--only=<commit-id>` promotes one commit ([CLI commit](https://docs.knock.app/cli/commit)). "Promotion only applies to accounts that have enabled environments."
- Every account starts with only **production**. Enabling environments adds **development**. After that, development becomes the default target for the CLI and Management API, "so pass `production` explicitly in any scripts that should keep targeting it". Knock copies only the `default` email layout into development ([Environments](https://docs.knock.app/version-control/environments)).
- "Content can only be edited in the environment in which it was created." The **Modify resources in any environment** setting is on by default. Turning it off makes every environment except development read-only, which forces the repo → development → promote path (same page).
- Knock branches can mirror Git branches. Knock's [CI/CD tutorial](https://docs.knock.app/tutorials/integrating-into-cicd) gives GitHub Actions that run `knock branch switch <git-branch> --create` and `knock push --branch=… --commit` on feature-branch pushes, `knock branch merge` plus promote on PR merge, and `knock commit promote --to=production` on deploy. Each Action uses a `KNOCK_SERVICE_TOKEN` secret created under Settings > Service tokens. Branches require environments ([Branches](https://docs.knock.app/version-control/branches)).

A minimal flow for Cadence: keep `.knock/` in Git, have CI run `knock push --environment=development --commit` on merge to `main`, then `knock commit promote --to=production` when releasing. Branches are optional.

### Plan gating

The pricing comparison lists "Manage via API & CLI" as **Yes** on Free, Starter and Enterprise. It also says you can "Create as many environments as you need" on all plans ([pricing](https://knock.app/pricing)). Enterprise-only items don't affect this flow: custom permission groups with per-environment access ([Environments](https://docs.knock.app/version-control/environments)) and per-tenant branding ([Per-tenant branding](https://docs.knock.app/multi-tenancy/per-tenant-branding)).

## 2. Replacing Knock's default layout

- Every account starts with a `default` layout. Its logo, icon and brand colour come from the Branding page, and its footer links are edited in the visual layout editor ([Email layouts](https://docs.knock.app/integrations/email/layouts)). The account-name/logo header and the footer come from this layout.
- A custom layout is any HTML (or MJML) document that contains `{{ content }}` inside `<body>`. Knock injects the rendered template there. Each layout also has a text version, `text_layout`, where the template's plaintext body is injected into `{{ content }}` (same page). Both `html_layout` and `text_layout` are **required** fields of the layout schema ([EmailLayout schema](https://docs.knock.app/mapi-reference/email_layouts/schemas/email_layout)).
- A template chooses its layout with `template.settings.layout_key` ([EmailTemplate schema](https://docs.knock.app/mapi-reference/templates/schemas/email_template)). Cadence can either **overwrite `layouts/default/`** in the repo, so every template picks it up without a change, or add `layouts/cadence/` and set `layout_key: "cadence"` on each Email step. Custom layouts aren't plan-gated anywhere in the docs or on the pricing page.
- **"Powered by Knock" is separate from the layout and is plan-gated.** The pricing table lists "Remove Knock branding" as No on Free and Yes on Starter and Enterprise ([pricing](https://knock.app/pricing)). Knock's FAQ says the branding appears "multiple times" when you're "double wrapping your email template in HTML", because the layout "already includes `<html>` and `<body>` tags" ([Testing and debugging FAQ](https://docs.knock.app/template-editor/testing-and-debugging#faq-duplicate-powered-by-knock-branding)). The branding therefore applies to email, not only to the prebuilt feed as `knock-email-provider.md` assumed. It also seems to be injected into each `<body>` at send time, not written in the layout's HTML (this is inferred from the FAQ, not stated). The likely consequence is that **a custom layout alone won't remove the footer on Free**. That needs confirming against a real send from a Free account.

## 3. HTML and plain-text multipart

- **Knock produces both parts.** Every sent email message's content has `html_body` and `text_body`, and both are **required** fields of `MessageEmailContent` in the public API spec (`data/specs/api/openapi.yml`; [Messages: get content](https://docs.knock.app/api-reference/messages/get_content)). The email overview says: "We'll automatically generate a text version of your emails, so you never need to write both HTML and text templates" ([Email overview](https://docs.knock.app/integrations/email/overview)). No page says in so many words that Knock hands both to the provider as a multipart/alternative message. That's an inference from the required `text_body` on every message.
- **The text part can be written separately.** `text_body` is "A text template for the email body. When omitted, the email template will be autogenerated from the `html_body` or `visual_blocks`" ([EmailTemplate schema](https://docs.knock.app/mapi-reference/templates/schemas/email_template)). In the repo this is a `"text_body@": "email_1/text_body.txt"` entry next to `html_body@`. The layout's `text_layout.txt` wraps it.
- **Why plain text inside `<html><body>` loses its line breaks.** In HTML, newlines in text are collapsed whitespace, so text with `\n` line breaks renders as one run-on paragraph. Writing a template's body as raw text wrapped in `<html><body>` causes two problems. First, the email client renders the newlines as spaces. Second, the template's own `<html><body>` sits inside the layout's `<html><body>`, which is the double-wrapping Knock's FAQ warns about (duplicate "Powered by Knock"). The text part autogenerated from that HTML can't recover line breaks the HTML never marked up. That last point is inferred, since Knock doesn't document its HTML-to-text converter. The fix:
  1. Templates contain only body fragments, with no `<html>` or `<body>`, and the layout owns the document.
  2. Mark paragraphs and breaks up in HTML (`<p>`, `<br>`). Alternatively, write markdown and convert it with Knock's `from_markdown` Liquid filter ([Liquid helpers](https://docs.knock.app/template-editor/reference-liquid-helpers)), or use visual blocks, whose text blocks are markdown files (`visual_blocks/1.content.md`).
  3. Write `text_body.txt` yourself so the plain-text part has exactly the line breaks you intend.

## 4. Rendering or previewing without credentials

- **No offline renderer exists.** The CLI has no render or preview command, and `validate`, `generate-types` and `workflow run` all take `--service-token` and call Knock ([README command list](https://github.com/knocklabs/knock-cli/blob/v1.6.1/README.md)). `knock workflow run --sandbox-mode` generates messages without sending them, but it runs on Knock's servers.
- **The preview API needs a service token.** `POST /v1/templates/preview` "Renders a template preview, without requiring a template to be persisted within Knock". For email you can pass a layout key or inline layout content, and the response contains `html_body`, `subject` and `text_body` ([Templates mAPI](https://docs.knock.app/mapi-reference/templates)). The Management API uses bearer auth with a service token (`securitySchemes.BearerAuth` in `data/specs/mapi/openapi.yml`). That works for an opt-in CI check that has a secret, not for credential-free local tests.
- **What credential-free tests can do.** Templates are plain Liquid files in the repo, so tests can:
  - check that every Notification has a workflow directory with the expected step refs, a `layout_key`, and a non-empty `text_body.txt`;
  - render the `.html` / `.txt` files with a JavaScript Liquid engine (for example `liquidjs`) against fixture `data` to catch missing variables and line-break regressions.

  This is only an approximation. Knock-specific filters (`from_markdown` and others), CSS inlining ("By default, Knock will inline all CSS", [Email overview](https://docs.knock.app/integrations/email/overview)), markdown compiled "at commit time" ([Translations](https://docs.knock.app/template-editor/translations)) and the "Powered by Knock" injection won't match exactly. Knock's own dashboard preview is described as "an approximation" too ([Email templates](https://docs.knock.app/template-editor/email-templates)).
- This sits fine with the map's no-credentials rule. Without Knock credentials, Cadence doesn't call Knock at all and uses a local fake, the same way `app/lib/mailer.server.ts` falls back to an outbox file when `POSTMARK_SERVER_TOKEN` is unset. The repo templates only matter once a real Knock environment renders them.

## Open questions

- Confirm on a real Free-plan send whether a custom layout without `vars.branding` still gets the "Powered by Knock" footer. Section 2 expects that it does.
- Knock doesn't document how it autogenerates `text_body`, which is one more reason to write `text_body.txt` for every Email step.
