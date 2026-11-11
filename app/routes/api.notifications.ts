import { data, redirect } from "react-router";
import type { Route } from "./+types/api.notifications";
import { getCurrentUserId } from "~/lib/session";
import { applyBellAction } from "~/lib/notifications/bell.server";
import { getNotificationService } from "~/lib/notifications/runtime.server";

// The bell's actions: mark one Notification read (then go to its target) or
// mark them all read. The app layout loader re-reads the feed afterwards.
export async function action({ request }: Route.ActionArgs) {
  const userId = await getCurrentUserId(request);
  if (!userId) {
    throw data("Select a user from the DevUI panel to read Notifications.", {
      status: 401,
    });
  }

  const formData = await request.formData();
  const { redirectTo } = await applyBellAction(
    getNotificationService(),
    userId,
    formData
  );

  if (redirectTo) return redirect(redirectTo);
  return { ok: true };
}
