import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/** Renders a single Sonner toast when the network drops, dismisses it on reconnect. */
export function OfflineToast() {
  const online = useOnlineStatus();
  const toastIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    if (!online) {
      // Persist the toast until reconnect.
      toastIdRef.current = toast("You're offline", {
        description: "Showing cached recipes. We'll sync when you're back.",
        duration: Infinity,
      });
    } else if (toastIdRef.current !== null) {
      toast.dismiss(toastIdRef.current);
      toastIdRef.current = null;
      toast.success("Back online");
    }
  }, [online]);

  return null;
}
