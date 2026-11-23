import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { ApiError } from "../api";
import { Button } from "../components/ui";
import { useAdmin } from "./session";

export default function AdminLogin() {
  const { session, signIn } = useAdmin();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? "/admin";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to={from} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signIn(username.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign-in failed.");
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4 py-16">
      <form onSubmit={submit} className="card mx-auto max-w-md p-8 space-y-5" aria-labelledby="admin-login-heading">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center h-11 w-11 rounded-full bg-navy text-yellow"><Lock className="h-5 w-5" aria-hidden="true" /></span>
          <h1 id="admin-login-heading" className="text-2xl font-extrabold text-navy">Admin sign in</h1>
        </div>
        <p className="text-sm text-muted-foreground">For SchemeSathi reviewers only. Citizens do not need an account.</p>
        <label className="block">
          <span className="text-sm font-medium">Username</span>
          <input className="field mt-1" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Password</span>
          <input className="field mt-1" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <Button type="submit" disabled={busy || !username || !password} className="w-full">{busy ? "Signing in..." : "Sign in"}</Button>
      </form>
    </div>
  );
}
