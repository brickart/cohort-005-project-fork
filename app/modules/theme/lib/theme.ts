export type Theme = "dark" | "light";

export function readDocumentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function subscribeToDocumentTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

// Must match the key the inline script in root.tsx reads before hydration.
const STORAGE_KEY = "cadence-theme";

export function setDocumentTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {}
}
