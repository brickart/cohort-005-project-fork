// Absolute links in Notifications are built from APP_URL when they are
// enqueued, and stored in the Notification's data. Templates never build URLs.
const DEFAULT_APP_URL = "http://localhost:5173";

export function appUrl(path: string): string {
  const base = (process.env.APP_URL || DEFAULT_APP_URL).replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
