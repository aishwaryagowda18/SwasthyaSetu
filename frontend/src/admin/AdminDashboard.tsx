import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi, type AdminSchemeRow, type ReviewStatus } from "../api";
import { ErrorBox, Loading } from "../components/ui";
import { useAdmin } from "./session";

export const STATUS_LABEL: Record<ReviewStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  reviewed: "Published",
};
export const STATUS_BADGE: Record<ReviewStatus, string> = {
  draft: "badge-no",
  in_review: "badge-info",
  reviewed: "badge-eligible",
};

export default function AdminDashboard() {
  const { session } = useAdmin();
  const [rows, setRows] = useState<AdminSchemeRow[] | null>(null);
  const [error, setError] = useState(false);
  const [status, setStatus] = useState<ReviewStatus | "all">("all");

  useEffect(() => {
    if (!session) return;
    adminApi.schemes(session.token).then((r) => setRows(r.schemes)).catch(() => setError(true));
  }, [session]);

  const counts = useMemo(() => {
    const c = { all: 0, draft: 0, in_review: 0, reviewed: 0 };
    (rows ?? []).forEach((r) => { c.all++; c[r.status]++; });
    return c;
  }, [rows]);
  const shown = (rows ?? []).filter((r) => status === "all" || r.status === status);

  return (
    <section aria-labelledby="admin-schemes-heading" className="space-y-6">
      <div>
        <h1 id="admin-schemes-heading" className="text-3xl font-extrabold text-navy">Scheme review</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Drafts are never shown to citizens. A scheme goes live only after an independent reviewer publishes it.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4" role="tablist" aria-label="Filter by status">
        {(["all", "draft", "in_review", "reviewed"] as const).map((s) => (
          <button key={s} role="tab" aria-selected={status === s} onClick={() => setStatus(s)}
            className={`card p-4 text-left ${status === s ? "card-navy" : ""}`}>
            <span className="block text-3xl font-extrabold">{counts[s]}</span>
            <span className="text-sm">{s === "all" ? "All schemes" : STATUS_LABEL[s]}</span>
          </button>
        ))}
      </div>

      {error && <ErrorBox>Could not load schemes.</ErrorBox>}
      {!error && rows === null && <Loading label="Loading schemes..." />}
      {rows !== null && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-navy">
              <tr>
                <th className="p-3">Scheme</th><th className="p-3">Level</th><th className="p-3">Status</th>
                <th className="p-3">Automated check</th><th className="p-3">Open exceptions</th><th className="p-3">Submitted / reviewed by</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.scheme_id} className="border-t border-border align-top">
                  <td className="p-3"><Link className="font-semibold text-blue hover:underline" to={`/admin/schemes/${r.scheme_id}`}>{r.name}</Link></td>
                  <td className="p-3 capitalize">{r.level}{r.state ? ` · ${r.state}` : ""}</td>
                  <td className="p-3"><span className={`badge ${STATUS_BADGE[r.status]}`}>{STATUS_LABEL[r.status]}</span></td>
                  <td className="p-3">{r.check_category}</td>
                  <td className="p-3">{r.exceptions.length}</td>
                  <td className="p-3 text-muted-foreground">{[r.submitted_by, r.reviewed_by].filter(Boolean).join(" / ") || "—"}</td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td className="p-3 text-muted-foreground" colSpan={6}>No schemes with this status.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
