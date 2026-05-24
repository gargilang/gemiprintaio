"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  applyEffectiveTheme,
  applyTheme,
  getEffectiveTheme,
  getStoredTheme,
  getSystemTheme,
  resolveTheme,
  setStoredTheme,
  THEME_CHANGE_EVENT,
  THEME_KEY,
  type EffectiveTheme,
  type Theme,
} from "@/lib/theme";

type ThemeContextValue = {
  /** Stored preference: "light" | "dark" | "system". */
  theme: Theme;
  /** Resolved effective theme: "light" | "dark". */
  effective: EffectiveTheme;
  /** Update the stored preference and apply it immediately. */
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Provides theme state and keeps <html> in sync.
 *
 * Responsibilities:
 *  - Initialize state from localStorage on mount (matches the boot script).
 *  - Apply preference whenever it changes.
 *  - Re-resolve when OS preference changes AND user is on "system" mode.
 *  - Listen for `storage` events so other tabs/windows stay in sync.
 *  - Force light mode during print, restore after.
 */
export default function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // SSR-safe defaults; real values are loaded in the mount effect below.
  const [theme, setThemeState] = useState<Theme>("system");
  const [effective, setEffective] = useState<EffectiveTheme>("light");
  const printPrevRef = useRef<EffectiveTheme | null>(null);

  // Initial load (after mount).
  useEffect(() => {
    const stored = getStoredTheme();
    setThemeState(stored);
    setEffective(resolveTheme(stored));
  }, []);

  // Whenever the stored preference changes, apply to <html>.
  useEffect(() => {
    applyTheme(theme);
    setEffective(resolveTheme(theme));
  }, [theme]);

  // Follow the OS-level color scheme while in "system" mode.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (theme !== "system") return;
    let mql: MediaQueryList;
    try {
      mql = window.matchMedia("(prefers-color-scheme: dark)");
    } catch {
      return;
    }
    const onChange = () => {
      const next = getSystemTheme();
      applyEffectiveTheme(next);
      setEffective(next);
    };
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    // Older Safari fallback.
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, [theme]);

  // Cross-tab/window sync.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_KEY) return;
      const next = getStoredTheme();
      setThemeState(next);
    };
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<Theme>).detail;
      if (detail === "light" || detail === "dark" || detail === "system") {
        setThemeState(detail);
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(THEME_CHANGE_EVENT, onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(THEME_CHANGE_EVENT, onCustom as EventListener);
    };
  }, []);

  // Force light during print, restore after.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onBefore = () => {
      printPrevRef.current = getEffectiveTheme();
      applyEffectiveTheme("light");
    };
    const onAfter = () => {
      const prev = printPrevRef.current;
      printPrevRef.current = null;
      if (prev) applyEffectiveTheme(prev);
      else applyTheme(getStoredTheme());
    };
    window.addEventListener("beforeprint", onBefore);
    window.addEventListener("afterprint", onAfter);
    return () => {
      window.removeEventListener("beforeprint", onBefore);
      window.removeEventListener("afterprint", onAfter);
    };
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setStoredTheme(next);
    setThemeState(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, effective, setTheme }),
    [theme, effective, setTheme]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/** Hook to read/update the current theme. Must be used inside <ThemeProvider>. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return ctx;
}
