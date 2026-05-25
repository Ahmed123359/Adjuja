import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function getInitial(): Theme {
  const stored = localStorage.getItem("theme") as Theme | null;
  if (stored) return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(t: Theme) {
  if (t === "dark") document.documentElement.classList.add("dark");
  else document.documentElement.classList.remove("dark");
  localStorage.setItem("theme", t);
  window.dispatchEvent(new CustomEvent("theme-change", { detail: t }));
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitial);

  // Apply on mount
  useEffect(() => { applyTheme(theme); }, []);

  // Sync across all hook instances via custom event
  useEffect(() => {
    const handler = (e: Event) => {
      setTheme((e as CustomEvent<Theme>).detail);
    };
    window.addEventListener("theme-change", handler);
    return () => window.removeEventListener("theme-change", handler);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }

  return { theme, toggle };
}
