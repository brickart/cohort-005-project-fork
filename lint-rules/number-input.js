// Route params, form data and search params are strings the user controls.
// `Number()` turns "" into 0 and "abc" into NaN, and both reach the query: an
// empty `lessonId` once opened lesson 0 for every learner. Parse them with a
// zod schema at the top of the loader or action instead. See "Parse untrusted
// input with a schema, at the edge" in CODING_STANDARDS.md.

const propertyName = (node) =>
  node.type === "MemberExpression" && !node.computed
    ? node.property.name
    : undefined;

const isNamed = (node, name) =>
  (node.type === "Identifier" && node.name === name) ||
  propertyName(node) === name;

// `params.lessonId`, `params["lessonId"]`
const isParamsMember = (node) =>
  node.type === "MemberExpression" &&
  node.object.type === "Identifier" &&
  node.object.name === "params";

// `formData.get("quizId")`, `url.searchParams.get("page")`
const isGetOn = (node, name) =>
  node.type === "CallExpression" &&
  propertyName(node.callee) === "get" &&
  isNamed(node.callee.object, name);

const isUntrusted = (node) =>
  isParamsMember(node) ||
  isGetOn(node, "formData") ||
  isGetOn(node, "searchParams");

const isNumberCall = (node) =>
  node.callee.type === "Identifier" && node.callee.name === "Number";

const noNumberOnInput = {
  meta: {
    type: "problem",
    messages: {
      number:
        'Number() on untrusted input turns "" into 0. Parse it with a zod schema, `z.coerce.number().int().positive()`: route params through `parseParams`, form data through `parseFormData` (app/lib/validation.ts).',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!isNumberCall(node)) return;
        const [arg] = node.arguments;
        if (arg && isUntrusted(arg)) {
          context.report({ node, messageId: "number" });
        }
      },
    };
  },
};

export default {
  meta: { name: "input" },
  rules: { "no-number-on-input": noNumberOnInput },
};
