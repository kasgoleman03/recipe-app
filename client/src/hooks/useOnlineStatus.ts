import * as React from "react";

/** Tracks the browser's online/offline state. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = React.useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  React.useEffect(() => {
    const onUp = () => setOnline(true);
    const onDown = () => setOnline(false);
    window.addEventListener("online", onUp);
    window.addEventListener("offline", onDown);
    return () => {
      window.removeEventListener("online", onUp);
      window.removeEventListener("offline", onDown);
    };
  }, []);
  return online;
}
