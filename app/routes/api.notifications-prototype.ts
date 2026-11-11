// PROTOTYPE (knock-end-to-end): mark feed items read. Throwaway.
import { data } from "react-router";
import type { Route } from "./+types/api.notifications-prototype";
import { getCurrentUserId } from "~/lib/session";
import { notificationService } from "~/lib/notifications.prototype.server";

export async function action({ request }: Route.ActionArgs) {
  const userId = await getCurrentUserId(request);
  if (!userId) throw data("Select a user from the DevUI panel", { status: 401 });

  const form = await request.formData();
  const ids = form.getAll("id").map(String);
  await notificationService().markRead(userId, ids);
  return { ok: true };
}
