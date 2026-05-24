// Registers the handwritten service worker located at /sw.js.
// Done in a dedicated module so main.tsx stays focused.

export function registerSW() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (import.meta.env.DEV) return; // Skip in dev to avoid stale-cache annoyances.

  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => console.warn("SW registration failed:", err));
  });
}
