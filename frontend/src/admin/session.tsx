import { createContext, useContext, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { adminApi, type AdminUser } from "../api";

// The admin session is kept in memory only (never in browser storage); refreshing the page signs out.
interface Session { token: string; user: AdminUser }
interface Ctx {
  session: Session | null;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  can: (permission: "read" | "submit" | "review" | "approve_sources" | "unpublish" | "audit") => boolean;
}

const PERMISSIONS: Record<AdminUser["role"], string[]> = {
  viewer: ["read"],
  editor: ["read", "submit"],
  reviewer: ["read", "submit", "review"],
  admin: ["read", "submit", "review", "approve_sources", "unpublish", "audit"],
};

const SessionContext = createContext<Ctx | null>(null);

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const value: Ctx = {
    session,
    signIn: async (username, password) => setSession(await adminApi.login(username, password)),
    signOut: async () => {
      if (session) await adminApi.logout(session.token).catch(() => undefined);
      setSession(null);
    },
    can: (p) => !!session && PERMISSIONS[session.user.role].includes(p), // display only; the server enforces
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useAdmin(): Ctx {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useAdmin must be used inside AdminSessionProvider");
  return ctx;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { session } = useAdmin();
  const location = useLocation();
  if (!session) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}
