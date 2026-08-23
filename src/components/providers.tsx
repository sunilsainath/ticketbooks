"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { X, CheckCircle2, AlertCircle, Info } from "lucide-react";

// ---------------------------------------------------------------------------
// Theme (light / dark / system)
// ---------------------------------------------------------------------------

type Theme = "light" | "dark" | "system";
const ThemeCtx = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({ theme: "system", setTheme: () => {} });

export function useTheme() {
  return useContext(ThemeCtx);
}

function applyTheme(pref: Theme) {
  const dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

type Toast = { id: number; title: string; description?: string; variant?: "success" | "error" | "info" };
const ToastCtx = createContext<{ toast: (t: Omit<Toast, "id">) => void }>({ toast: () => {} });
export function useToast() {
  return useContext(ToastCtx);
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const stored = (localStorage.getItem("strike-theme") as Theme) || "system";
    setThemeState(stored);
    applyTheme(stored);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme((localStorage.getItem("strike-theme") as Theme) || "system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    localStorage.setItem("strike-theme", t);
    setThemeState(t);
    applyTheme(t);
  }, []);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 5000);
  }, []);  return (
    <ThemeCtx.Provider value={{ theme, setTheme }}>
      <ToastCtx.Provider value={{ toast }}>
        {children}
        <div className="fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2" aria-live="polite">
          {toasts.map((t) => (
            <div
              key={t.id}
              role="status"
              className={`animate-fade-in pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-card p-3.5 shadow-lg ${
                t.variant === "error" ? "border-destructive/40" : t.variant === "success" ? "border-success/40" : ""
              }`}
            >
              {t.variant === "success" ? (
                <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 h-[18px] w-[18px] shrink-0 text-success" />
              ) : t.variant === "error" ? (
                <AlertCircle className="h-[18px] w-[18px] shrink-0 text-destructive" />
              ) : (
                <Info className="h-[18px] w-[18px] shrink-0 text-primary" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t.title}</p>
                {t.description && <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>}
              </div>
              <button onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))} aria-label="Dismiss">
                <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </button>
            </div>
          ))}
        </div>
      </ToastCtx.Provider>
    </ThemeCtx.Provider>
  );
}
