"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface Settings {
  dark: boolean;
  setDark: (v: boolean) => void;
  showMath: boolean;
  setShowMath: (v: boolean) => void;
  guided: boolean;
  setGuided: (v: boolean) => void;
}

const Ctx = createContext<Settings | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(false);
  const [showMath, setShowMath] = useState(false);
  const [guided, setGuided] = useState(true);

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem("dgl-settings") || "{}");
      if (typeof s.dark === "boolean") setDark(s.dark);
      else setDark(window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
      if (typeof s.showMath === "boolean") setShowMath(s.showMath);
      if (typeof s.guided === "boolean") setGuided(s.guided);
    } catch {
      /* storage unavailable: defaults are fine */
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("dgl-settings", JSON.stringify({ dark, showMath, guided }));
    } catch {
      /* ignore */
    }
  }, [dark, showMath, guided]);

  return <Ctx.Provider value={{ dark, setDark, showMath, setShowMath, guided, setGuided }}>{children}</Ctx.Provider>;
}

export function useSettings() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSettings outside provider");
  return c;
}
