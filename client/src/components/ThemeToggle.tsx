import { Moon, Sun, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";

/** Cycles through system → light → dark with `aria-pressed` on the active icon. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const next = theme === "system" ? "light" : theme === "light" ? "dark" : "system";

  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const label =
    theme === "dark"
      ? "Switch to system theme"
      : theme === "light"
        ? "Switch to dark theme"
        : "Switch to light theme";

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      onClick={() => setTheme(next)}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
    </Button>
  );
}
