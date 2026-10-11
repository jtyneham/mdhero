import { writable, get } from "svelte/store";
import { isAndroid } from "../utils/platform";
import { native } from "../tauri/android";

export type ThemeMode = "light" | "dark" | "system";

function savedTheme(): ThemeMode {
  try {
    const value = localStorage.getItem("mdhero-theme");
    return value === "light" || value === "dark" ? value : "system";
  } catch { return "system"; }
}
export const themeMode = writable<ThemeMode>(savedTheme());
themeMode.subscribe(value => { try { localStorage.setItem("mdhero-theme", value); } catch {} });

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function getEffectiveTheme(): "light" | "dark" {
  const mode = get(themeMode);
  if (mode === "system") return getSystemTheme();
  return mode;
}

export function applyCurrentTheme(): void {
  const theme = getEffectiveTheme();
  const html = globalThis.document?.documentElement;
  if (!html) return;

  if (theme === "dark") {
    html.classList.add("dark");
  } else {
    html.classList.remove("dark");
  }
  if (isAndroid) void native("appearance", { dark: theme === "dark" }).catch(() => {});
}

export function initThemeListener(): void {
  // Apply on init
  applyCurrentTheme();

  // Listen for OS theme changes
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", () => {
    applyCurrentTheme();
  });

  // Listen for store changes
  themeMode.subscribe(() => {
    applyCurrentTheme();
  });
}

export function cycleTheme(current: ThemeMode): ThemeMode {
  const order: ThemeMode[] = ["system", "light", "dark"];
  const idx = order.indexOf(current);
  return order[(idx + 1) % order.length];
}
