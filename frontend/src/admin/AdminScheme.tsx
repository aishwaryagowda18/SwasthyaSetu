import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink } from "lucide-react";
import { adminApi, ApiError, type AdminDetail } from "../api";
import { Button, ErrorBox, Loading } from "../components/ui";
import { STATUS_BADGE, STATUS_LABEL } from "./AdminDashboard";
import { useAdmin } from "./session";

function Box({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card p-6">
      <h2 className="text-lg font-bold text-navy">{title}</h2>
      <div className="mt-3 text-sm">{children}</div>
    </section>
  );
}

const where = (i: { page?: number | null; section?: string | null }) =>
  [i.page ? `p.${i.page}` : null, i.section].filter(Boolean).join(", ");

export default function AdminScheme() {
  const { schemeId = "" } = useParams();
  const { session, can } = useAdmin();
  const [data, setData] = useState<AdminDetail | null>(null);
  const [loadError, setLoadError] = useState("");
  const [comment, setComment] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string; blockers?: string[] } | null>(null);

  const load = useCallback(() => {
    if (!session) return;
    adminApi.scheme(session.token, schemeId).then(setData)
      .catch((e) => setLoadError(e instanceof ApiError && e.status === 404 ? "Scheme not found." : "Could not load this scheme."));
  }, [session, schemeId]);
  useEffect(load, [load]);

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      setMessage({ kind: "ok", text: label });
      setComment("");
      setAck(false);
      load();
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof ApiError ? e.message : "Action failed.", blockers: e instanceof ApiError ? e.blockers : [] });
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <ErrorBox>{loadError}</ErrorBox>;
  if (!data || !session) return <Loading />;
  const { record: r, issues } = data;
  const status = r.verification.status;
  const exceptions = issues.filter((i) => i.exception);
  const token = session.token;

  return (
    <div className="space-y-5">
      <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All schemes
      </Link>
      <header className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <span className={`badge ${STATUS_BADGE[status]}`}>{STATUS_LABEL[status]}</span>
          <span className="badge capitalize">{r.level}{r.state ? ` · ${r.state}` : ""}</span>
          <span className="badge">Automated check: {data.check_category}</span>
        </div>
        <h1 className="text-3xl font-extrabold text-navy">{r.name}</h1>
        <p className="text-sm text-muted-foreground">
          {r.issuing_body} · Prepared by {r.verification.prepared_by ?? "—"}
          {r.verification.submitted_by && ` · Submitted by ${r.verification.submitted_by}`}
          {r.verification.reviewed_by && ` · Reviewed by ${r.verification.reviewed_by} on ${r.verification.reviewed_at}`}
        </p>
        {r.verification.review_comment && (
          <p className="text-sm"><strong>Last review comment:</strong> {r.verification.review_comment}</p>
        )}
      </header>

      {/* Actions */}
      <section className="card card-soft p-6 space-y-4" aria-labelledby="actions-heading">
        <h2 id="actions-heading" className="text-lg font-bold text-navy">Actions</h2>
        {message && (
          <div role={message.kind === "error" ? "alert" : "status"} className={`rounded-lg p-3 text-sm ${message.kind === "ok" ? "bg-[#dcf5e7]" : "bg-[#fde8e1]"}`}>
            <p className="font-semibold">{message.text}</p>
            {message.blockers && message.blockers.length > 0 && <ul className="mt-1 list-disc pl-5">{message.blockers.map((b) => <li key={b}>{b}</li>)}</ul>}
          </div>
        )}
        <label className="block">
          <span className="text-sm font-medium">Comment</span>
          <textarea className="field mt-1" rows={2} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)}
            placeholder="What you checked, or what needs to change" />
        </label>

        {status === "draft" && can("submit") && (
          <Button disabled={busy} onClick={() => act("Submitted for review.", () => adminApi.submit(token, r.scheme_id, comment))}>Submit for review</Button>
        )}

        {status === "in_review" && can("review") && (
          data.independent_reviewer_ok ? (
            <div className="space-y-3">
              {exceptions.length > 0 && (
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                  I have checked the {exceptions.length} open exception(s) below against the official sources.
                </label>
              )}
              <div className="flex flex-wrap gap-3">
                <Button disabled={busy} onClick={() => act("Published. The scheme is now visible to citizens.", () => adminApi.review(token, r.scheme_id, "publish", comment, ack))}>
                  Verify and publish
                </Button>
                <Button variant="outline" disabled={busy || !comment.trim()} onClick={() => act("Returned to draft.", () => adminApi.review(token, r.scheme_id, "return", comment, false))}>
                  Return to draft
                </Button>
              </div>
              {!comment.trim() && <p className="text-xs text-muted-foreground">A comment is required to return a scheme.</p>}
            </div>
          ) : (
            <p className="text-sm" role="note">You prepared or submitted this scheme, so a different reviewer must verify it.</p>
          )
        )}

        {status === "reviewed" && can("unpublish") && (
          <Button variant="outline" disabled={busy || !comment.trim()} onClick={() => act("Unpublished. The scheme is hidden from citizens.", () => adminApi.unpublish(token, r.scheme_id, comment))}>
            Unpublish
          </Button>
        )}
        {status === "draft" && !can("submit") && <p className="text-sm text-muted-foreground">Your role can view only.</p>}
      </section>

      {/* Automated checks */}
      <Box title={`Automated checks (${exceptions.length} open exception${exceptions.length === 1 ? "" : "s"})`}>
        {issues.length === 0 ? <p className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" /> No findings.</p> : (
          <ul className="space-y-1">
            {issues.map((i, n) => (
              <li key={n} className="flex gap-2">
                {i.exception ? <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-label="Exception" /> : <span className="w-4 shrink-0 text-muted-foreground" aria-label="Information">ℹ</span>}
                <span><span className="font-semibold">{i.category}:</span> {i.message}</span>
              </li>
            ))}
          </ul>
        )}
      </Box>

      <Box title="Eligibility rules">
        {r.rules.groups.map((g) => (
          <div key={g.key} className="mb-3">
            <p className="font-semibold">Group “{g.key}” — {g.mode === "all" ? "all must pass" : "any one passes"}</p>
            <ul className="list-disc pl-5">
              {g.rules.map((rule, n) => (
                <li key={n}>
                  {rule.message} <code className="text-xs bg-muted px-1 rounded">{rule.operator === "manual_check" ? "manual check" : `${rule.field} ${rule.operator} ${JSON.stringify(rule.value ?? "")}`}</code>
                  <span className="text-xs text-muted-foreground"> [{rule.source_id} {where(rule)}]</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Box>

      <Box title="Benefits, documents and how to apply">
        <p className="font-semibold">Benefits</p>
        <ul className="list-disc pl-5 mb-3">{r.benefits.map((b, n) => <li key={n}>{b.text} <span className="text-xs text-muted-foreground">[{b.source_id} {where(b)}]</span></li>)}</ul>
        <p className="font-semibold">Documents</p>
        {r.required_documents.length ? <ul className="list-disc pl-5 mb-3">{r.required_documents.map((d, n) => <li key={n}>{d.name} <span className="text-xs text-muted-foreground">[{d.source_id} {where(d)}]</span></li>)}</ul> : <p className="mb-3 text-muted-foreground">None recorded.</p>}
        <p className="font-semibold">How to apply</p>
        {r.how_to_apply.length ? <ul className="list-disc pl-5 mb-3">{r.how_to_apply.map((h, n) => <li key={n}>{h.text} <span className="text-xs text-muted-foreground">[{h.source_id} {where(h)}]</span></li>)}</ul> : <p className="mb-3 text-muted-foreground">None recorded.</p>}
        <p className="font-semibold">Official apply link</p>
        <p>{r.apply_link ? <a className="text-blue underline" href={r.apply_link.url} target="_blank" rel="noopener noreferrer">{r.apply_link.url}</a> : "None recorded"}</p>
      </Box>

      <Box title={`Evidence quotes (${r.evidence.length})`}>
        <ul className="space-y-3">
          {r.evidence.map((e, n) => (
            <li key={n}>
              <p className="font-semibold">{e.claim} <span className="text-xs text-muted-foreground">[{e.source_id} {where(e)}]</span></p>
              <blockquote className="border-l-4 border-sky pl-3 italic">“{e.quote}”</blockquote>
            </li>
          ))}
        </ul>
      </Box>

      <Box title="Sources">
        <ul className="space-y-2">
          {r.sources.map((s) => (
            <li key={s.id}>
              <a className="inline-flex items-center gap-1 text-blue underline" href={s.url} target="_blank" rel="noopener noreferrer">
                {s.title} <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
              <span className="block text-xs text-muted-foreground">{s.id} · {s.kind} · checked {s.checked_at}{s.notes ? ` · ${s.notes}` : ""}</span>
            </li>
          ))}
        </ul>
      </Box>

      {(r.flags?.length ?? 0) > 0 && (
        <Box title="Reviewer flags">
          <ul className="list-disc pl-5">{r.flags!.map((f, n) => <li key={n}><strong>{f.type}:</strong> {f.detail}</li>)}</ul>
        </Box>
      )}

      {(r.verification.history?.length ?? 0) > 0 && (
        <Box title="History">
          <ul className="space-y-1">{r.verification.history!.map((h, n) => <li key={n}>{h.at} — <strong>{h.action}</strong> by {h.by}{h.comment ? `: ${h.comment}` : ""}</li>)}</ul>
        </Box>
      )}
    </div>
  );
}
