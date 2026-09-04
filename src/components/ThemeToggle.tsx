"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";
const STORAGE_KEY = "kairo:theme";

/**
 * Cycles system -> light -> dark -> system. "System" is the absence of a
 * data-theme attribute (globals.css falls back to prefers-color-scheme);
 * light/dark stamp the attribute explicitly and win regardless of the OS
 * setting. The blocking script in layout.tsx applies whatever was last
 * saved before first paint, so there's no flash on reload - this component
 * only needs to read that same value back into its own display state.
 */
function applyTheme(theme: Theme) {
  if (theme === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "light" || stored === "dark") setTheme(stored);
    } catch {
      // Storage disabled - stay on "system", which needs no persistence.
    }
  }, []);

  function cycle() {
    const next: Theme = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    setTheme(next);
    applyTheme(next);
    try {
      if (next === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Falls back to asking again next load - harmless.
    }
  }

  const label =
    theme === "system" ? "Theme: system (click for light)"
    : theme === "light" ? "Theme: light (click for dark)"
    : "Theme: dark (click for system)";

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={label}
      title={label}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted transition-all hover:text-foreground active:scale-90"
    >
      {theme === "light" ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
          <circle cx="12" cy="12" r="4.5" fill="currentColor" />
          <path
            d="M12 2.5v2.5M12 19v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2.5 12H5M19 12h2.5M4.2 19.8L6 18M18 6l1.8-1.8"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      ) : theme === "dark" ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
          <path
            d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"
            fill="currentColor"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
          <rect x="3" y="4.5" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 20h8M12 16.5V20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
