import { useCallback, useEffect, useState } from "react";
import { adminApi, ApiError, type AuditEntry, type SourceDomain } from "../api";
import { Button, ErrorBox, Loading } from "../components/ui";
import { useAdmin } from "./session";

export function AdminSources() {
  const { session, can } = useAdmin();
  const [domains, setDomains] = useState<SourceDomain[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (session) adminApi.sources(session.token).then((r) => setDomains(r.domains)).catch(() => setError("Could not load domains."));
  }, [session]);
  useEffect(load, [load]);

  const approve = async (domain: string) => {
    if (!session) return;
    try {
      await adminApi.approveSource(session.token, domain);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Approval failed.");
    }
  };

  return (
    <section className="space-y-4" aria-labelledby="sources-heading">
      <h1 id="sources-heading" className="text-3xl font-extrabold text-navy">Approved source domains</h1>
      <p className="text-sm text-muted-foreground">Only sources on approved official domains can be used for published schemes.</p>
      {error && <ErrorBox>{error}</ErrorBox>}
      {!domains && !error && <Loading />}
      {domains && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-navy"><tr><th className="p-3">Domain</th><th className="p-3">Issuing body</th><th className="p-3">Status</th><th className="p-3"></th></tr></thead>
            <tbody>
              {domains.map((d) => (
                <tr key={d.domain} className="border-t border-border">
                  <td className="p-3 font-mono">{d.domain}</td>
                  <td className="p-3">{d.issuing_body}</td>
                  <td className="p-3">
                    <span className={`badge ${d.status === "approved" ? "badge-eligible" : "badge-info"}`}>{d.status}</span>
                    {d.approved_by && <span className="block text-xs text-muted-foreground">by {d.approved_by} on {d.approved_at}</span>}
                  </td>
                  <td className="p-3">
                    {d.status !== "approved" && can("approve_sources") && (
                      <Button className="py-1.5 px-3" onClick={() => approve(d.domain)} aria-label={`Approve ${d.domain}`}>Approve</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function AdminAudit() {
  const { session } = useAdmin();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (session) adminApi.audit(session.token).then((r) => setEntries(r.entries)).catch(() => setError(true));
  }, [session]);
  return (
    <section className="space-y-4" aria-labelledby="audit-heading">
      <h1 id="audit-heading" className="text-3xl font-extrabold text-navy">Audit log</h1>
      {error && <ErrorBox>Could not load the audit log (admins only).</ErrorBox>}
      {!entries && !error && <Loading />}
      {entries && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-navy"><tr><th className="p-3">When (UTC)</th><th className="p-3">User</th><th className="p-3">Action</th><th className="p-3">Target</th><th className="p-3">Comment</th></tr></thead>
            <tbody>
              {entries.map((e, n) => (
                <tr key={n} className="border-t border-border"><td className="p-3">{e.at}</td><td className="p-3">{e.user} ({e.role})</td><td className="p-3">{e.action}</td><td className="p-3">{e.target}</td><td className="p-3">{e.comment}</td></tr>
              ))}
              {entries.length === 0 && <tr><td className="p-3 text-muted-foreground" colSpan={5}>No entries yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
