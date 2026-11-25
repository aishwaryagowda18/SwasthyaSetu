import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { KN } from "./kn";

/**
 * English / Kannada interface text.
 *
 * - Interface text is written in English inside t("...") and translated from the KN dictionary;
 *   anything missing falls back to English (a test checks that every t("...") has a translation).
 * - Scheme content from official sources (benefits, rules, notices) is NOT translated automatically,
 *   so its meaning cannot change. It is shown as written in the source.
 * - The language choice is kept in app memory only (not in browser storage), like the user's answers.
 */
export type Lang = "en" | "kn";

type Vars = Record<string, string | number>;
interface Ctx { lang: Lang; setLang: (l: Lang) => void; t: (text: string, vars?: Vars) => string }

/** Marks English text for translation where it is defined (e.g. in constant lists); translate it later with t(). */
export const tx = (text: string) => text;

function fill(text: string, vars?: Vars) {
  return vars ? text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text;
}

export function translate(lang: Lang, text: string, vars?: Vars) {
  return fill(lang === "kn" ? KN[text] ?? text : text, vars);
}

const LangContext = createContext<Ctx>({ lang: "en", setLang: () => {}, t: (s, v) => fill(s, v) });

export function LanguageProvider({ children, initial = "en" }: { children: ReactNode; initial?: Lang }) {
  const [lang, setLang] = useState<Lang>(initial);
  const t = useCallback((text: string, vars?: Vars) => translate(lang, text, vars), [lang]);
  useEffect(() => { document.documentElement.lang = lang === "kn" ? "kn" : "en"; }, [lang]);
  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export const useT = () => useContext(LangContext);

/** Format an ISO date (YYYY-MM-DD) for display, e.g. "21 Nov 2026". */
export function formatDate(iso: string | null | undefined, lang: Lang) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === "kn" ? "kn-IN" : "en-IN", { day: "numeric", month: "short", year: "numeric" });
}
