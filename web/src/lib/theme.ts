export type Theme = "light" | "dark";

const STORAGE_KEY = "bl-theme";
const THEME_COLOR: Record<Theme, string> = { light: "#f26979", dark: "#0c1a32" };

/** The theme currently applied to the page (set before first paint by /theme-init.js). */
export function currentTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage can be blocked (private mode); the choice then lasts for this visit only.
  }
}
