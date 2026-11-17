import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";
import plugin from "./number-input.js";

RuleTester.describe = describe;
RuleTester.it = it;

const error = [{ messageId: "number" }];

new RuleTester().run("no-number-on-input", plugin.rules["no-number-on-input"], {
  valid: [
    "parseParams(params, schema)",
    "Number(value)",
    "Number(row.params.id)",
    "Number(map.get('id'))",
    "Number(form.formData)",
    "Number()",
    "String(params.id)",
    "Number(params)",
    "z.coerce.number().parse(params.id)",
  ],
  invalid: [
    { code: "Number(params.lessonId)", errors: error },
    { code: "Number(params['lessonId'])", errors: error },
    { code: "Number(formData.get('quizId'))", errors: error },
    { code: "Number(searchParams.get('page'))", errors: error },
    { code: "Number(url.searchParams.get('page'))", errors: error },
    { code: "Number(request.formData.get('id'))", errors: error },
    {
      code: "const ids = [Number(params.a), Number(params.b)]",
      errors: [...error, ...error],
    },
  ],
});
