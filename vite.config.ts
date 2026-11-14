import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, isRunnableDevEnvironment, type Plugin } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * `react-router dev` only loads the server build on the first request, so
 * app/entry.server.tsx (which starts the Notification drainer) would not run
 * until someone opened a page. This loads it in the same SSR environment as
 * soon as the dev server is listening, so the drainer sweeps at boot in dev
 * just as it does under `npm run start`.
 */
function startServerAtBoot(): Plugin {
  return {
    name: "cadence:start-server-at-boot",
    apply: "serve",
    configureServer(server) {
      server.httpServer?.once("listening", () => {
        const ssr = server.environments.ssr;
        if (!isRunnableDevEnvironment(ssr)) return;
        ssr.runner
          .import("virtual:react-router/server-build")
          .catch((error: unknown) => {
            console.error(
              "[dev] Loading the server build at boot failed:",
              error
            );
          });
      });
    },
  };
}

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths(), startServerAtBoot()],
});
