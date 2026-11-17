// A module's internals take the time as an argument, so their tests can run
// at a fixed moment. `Date.now()` and an argument-less `new Date()` read the
// real clock. The entry point or the route reads it and passes it in. See
// "Inject the clock" in CODING_STANDARDS.md.

const isDateNow = (node) =>
  node.callee.type === "MemberExpression" &&
  !node.callee.computed &&
  node.callee.object.type === "Identifier" &&
  node.callee.object.name === "Date" &&
  node.callee.property.name === "now";

const isNewDateNow = (node) =>
  node.callee.type === "Identifier" &&
  node.callee.name === "Date" &&
  node.arguments.length === 0;

const noClockRead = {
  meta: {
    type: "problem",
    messages: {
      clock:
        "This reads the real clock. Take the time as an argument (`now: Date`) and let the caller pass `new Date()`.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (isDateNow(node)) context.report({ node, messageId: "clock" });
      },
      NewExpression(node) {
        if (isNewDateNow(node)) context.report({ node, messageId: "clock" });
      },
    };
  },
};

export default {
  meta: { name: "clock" },
  rules: { "no-clock-read": noClockRead },
};
