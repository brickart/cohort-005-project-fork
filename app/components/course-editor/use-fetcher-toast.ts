import { useEffect } from "react";
import { toast } from "sonner";

export type Fetcher = {
  state: "idle" | "loading" | "submitting";
  data?: { success?: unknown; error?: string };
};

export function useFetcherToast(fetcher: Fetcher, successMessage: string) {
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      toast.success(successMessage);
    }
    if (fetcher.state === "idle" && fetcher.data?.error) {
      toast.error(fetcher.data.error);
    }
  }, [fetcher.state, fetcher.data, successMessage]);
}
