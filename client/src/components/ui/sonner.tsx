import { Toaster as SonnerToaster, type ToasterProps } from "sonner";
import { useTheme } from "@/lib/theme";

/**
 * Themed wrapper around sonner's <Toaster />. Picks up the current
 * Warm Kitchen theme (light/dark) and themes the toasts to match.
 */
export function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme();
  return (
    <SonnerToaster
      theme={resolvedTheme}
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border/60 group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
}
