import type { Plugin } from "@oxlint/plugins";

declare const plugin: Plugin & { rules: Required<Plugin>["rules"] };
export default plugin;
