"use client";

type ThemeMode = "dark" | "light";

const storageKey = "scout-theme";

function resolveThemeMode(value: string | undefined): ThemeMode {
  return value === "light" ? "light" : "dark";
}

function applyThemeMode(themeMode: ThemeMode) {
  document.documentElement.dataset.theme = themeMode;

  try {
    window.localStorage.setItem(storageKey, themeMode);
  } catch {
    // Ignore localStorage failures and keep the session theme in-memory.
  }
}

export function ThemeToggle() {
  return (
    <div className="theme-toggle-shell">
      <button
        aria-label="Toggle between dark default and light mode"
        className="theme-toggle"
        onClick={() => {
          const activeTheme = resolveThemeMode(document.documentElement.dataset.theme);
          const nextThemeMode = activeTheme === "dark" ? "light" : "dark";
          applyThemeMode(nextThemeMode);
        }}
        type="button"
      >
        <span aria-hidden="true" className="theme-toggle-track">
          <span className="theme-toggle-thumb" />
        </span>
        <span className="theme-toggle-copy">
          <span className="theme-toggle-label">Theme</span>
          <span className="theme-toggle-hint">Dark default, light optional</span>
        </span>
      </button>
    </div>
  );
}
