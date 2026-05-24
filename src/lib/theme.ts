/**
 * Theme management primitives shared across the app (web + Tauri).
 *
 * The user's preference is stored in localStorage under `THEME_KEY` with one
 * of three values: "light" | "dark" | "system". When "system", we follow the
 * OS-level `prefers-color-scheme` media query and re-resolve on change.
 *
 * The actual application of the theme (adding/removing the `dark` class on
 * <html>) happens in two places:
 *   1. <ThemeScript /> renders an inline boot script in <head> so the class
 *      is set BEFORE React hydrates. This avoids a flash of wrong theme.
 *   2. <ThemeProvider /> keeps things in sync at runtime (storage events,
 *      OS-level changes when in "system" mode, print listeners, etc.).
 */

export type Theme = "light" | "dark" | "system";
export type EffectiveTheme = "light" | "dark";

export const THEME_KEY = "gemiprint_theme";
export const THEME_CHANGE_EVENT = "gemiprint:theme-change";

/** Read the user's preference from storage. Falls back to "system". */
export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    if (value === "light" || value === "dark" || value === "system") {
      return value;
    }
  } catch {
    /* localStorage may be blocked (private mode, etc.) */
  }
  return "system";
}

/** Persist the preference. Triggers a custom event for in-tab listeners. */
export function setStoredTheme(theme: Theme): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(
      new CustomEvent<Theme>(THEME_CHANGE_EVENT, { detail: theme })
    );
  } catch {
    /* ignore */
  }
}

/** What does the OS say about prefers-color-scheme? */
export function getSystemTheme(): EffectiveTheme {
  if (typeof window === "undefined") return "light";
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}

/** Resolve a stored preference to a concrete light/dark value. */
export function resolveTheme(theme: Theme): EffectiveTheme {
  if (theme === "system") return getSystemTheme();
  return theme;
}

/** Read effective theme (resolves "system" -> light/dark). */
export function getEffectiveTheme(): EffectiveTheme {
  return resolveTheme(getStoredTheme());
}

/** Apply the effective theme to <html> by toggling the `dark` class. */
export function applyEffectiveTheme(effective: EffectiveTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (effective === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

/** Apply a stored preference (resolves system -> light/dark first). */
export function applyTheme(theme: Theme): void {
  applyEffectiveTheme(resolveTheme(theme));
}
