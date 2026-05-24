import * as React from "react";

type Theme = "light" | "dark" | "system";
type Resolved = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: Resolved;
  setTheme: (t: Theme) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = "recipe-app:theme";

function readSystem(): Resolved {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** ThemeProvider persists the user's choice and respects system preference. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    if (typeof window === "undefined") return "system";
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return (stored as Theme) ?? "system";
  });
  const [resolvedTheme, setResolvedTheme] = React.useState<Resolved>(() =>
    theme === "system" ? readSystem() : theme,
  );

  // Apply the resolved theme to <html> + react to system changes when in "system" mode.
  React.useEffect(() => {
    const apply = (next: Resolved) => {
      const root = document.documentElement;
      root.classList.toggle("dark", next === "dark");
      root.style.colorScheme = next;
      setResolvedTheme(next);
    };
    if (theme === "system") {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      apply(media.matches ? "dark" : "light");
      const onChange = (e: MediaQueryListEvent) => apply(e.matches ? "dark" : "light");
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    }
    apply(theme);
  }, [theme]);

  const setTheme = React.useCallback((t: Theme) => {
    setThemeState(t);
    try {
      window.localStorage.setItem(STORAGE_KEY, t);
    } catch {
      // localStorage may be unavailable (private mode, quota); ignore.
    }
  }, []);

  const value = React.useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
