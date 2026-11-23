import { createContext, useContext, useState, type ReactNode } from "react";
import type { Profile } from "./api";

/**
 * Citizen answers and the schemes chosen for a checklist, kept in app memory only.
 * Not in browser storage, cookies or the tab's navigation history, so a reload or
 * closing the tab clears them.
 */
export interface Answers {
  profile: Profile | null;
  checklistIds: string[];
}

interface Ctx extends Answers {
  setProfile: (update: Profile | ((p: Profile | null) => Profile)) => void;
  setChecklistIds: (ids: string[]) => void;
}

const AnswersContext = createContext<Ctx | null>(null);

export function AnswersProvider({ children, initial }: { children: ReactNode; initial?: Partial<Answers> }) {
  const [profile, setProfileState] = useState<Profile | null>(initial?.profile ?? null);
  const [checklistIds, setChecklistIds] = useState<string[]>(initial?.checklistIds ?? []);
  const setProfile: Ctx["setProfile"] = (update) =>
    setProfileState((prev) => (typeof update === "function" ? update(prev) : update));
  return (
    <AnswersContext.Provider value={{ profile, checklistIds, setProfile, setChecklistIds }}>
      {children}
    </AnswersContext.Provider>
  );
}

export function useAnswers(): Ctx {
  const ctx = useContext(AnswersContext);
  if (!ctx) throw new Error("useAnswers must be used inside AnswersProvider");
  return ctx;
}
