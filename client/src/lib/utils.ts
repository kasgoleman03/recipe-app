import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** cn merges Tailwind class strings, deduping conflicting utilities. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** formatMinutes returns "1 h 20 m" / "45 m" or null when undefined. */
export function formatMinutes(min?: number | null): string | null {
  if (min == null || min < 0) return null;
  if (min < 60) return `${min} m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} m`;
}

/**
 * TheMealDB sometimes returns preview-sized thumbnails (for example
 * `/preview` variants). Strip those suffixes so the browser gets the
 * highest-resolution image TheMealDB exposes for cards and detail pages.
 */
export function highQualityMealImage(url?: string | null): string | undefined {
  if (!url) return undefined;
  return url
    .replace(/\/preview$/i, "")
    .replace(/\/small$/i, "")
    .replace(/\/medium$/i, "");
}
