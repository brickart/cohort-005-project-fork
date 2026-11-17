import { useSyncExternalStore } from "react";
import {
  readDocumentTheme,
  setDocumentTheme,
  subscribeToDocumentTheme,
  type Theme,
} from "./lib/theme";

export type { Theme };
export { readDocumentTheme, setDocumentTheme, subscribeToDocumentTheme };

// The server cannot read localStorage, so it renders light; the inline
// script in root.tsx adds `.dark` before hydration and the store catches up.
function serverTheme(): Theme {
  return "light";
}

/**
 * The app's theme, following the `.dark` class on `<html>` live, so a
 * toggle anywhere reaches every caller.
 */
export function useTheme(): Theme {
  return useSyncExternalStore(
    subscribeToDocumentTheme,
    readDocumentTheme,
    serverTheme
  );
}
