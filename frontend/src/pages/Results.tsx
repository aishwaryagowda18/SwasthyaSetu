import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAnswers } from "../answers";
import { ArrowLeft, CheckCircle2, CircleHelp, ClipboardCheck, XCircle } from "lucide-react";
import { api, type SchemeCheckResult, type SchemeSummary } from "../api";
import { FIELD_LABELS, FOLLOW_UP_QUESTIONS } from "../options";
import { ApplyLink, Button, ErrorBox, LevelTabs, Loading, matchesLevel, type LevelFilter } from "../components/ui";

const ORDER = { eligible: 0, need_more_info: 1, not_eligible: 2, rules_not_verified: 3 } as const;

function ResultCard({ r, info }: { r: SchemeCheckResult; info?: SchemeSummary }) {
  const rules = r.groups.flatMap((g) => g.rules);
  const badge = {
    eligible: <span className="badge badge-eligible"><CheckCircle2 className="h-3 w-3 mr-1" aria-hidden="true" />Likely eligible</span>,
    need_more_info: <span className="badge badge-info"><CircleHelp className="h-3 w-3 mr-1" aria-hidden="true" />Needs more information</span>,
    not_eligible: <span className="badge badge-no"><XCircle className="h-3 w-3 mr-1" aria-hidden="true" />Not eligible</span>,
    rules_not_verified: <span className="badge badge-no">Rules not verified</span>,
  }[r.result];

  const tone = r.result === "eligible" ? "card-accent" : r.result === "need_more_info" ? "card-soft" : "";
  return (
    <article className={`card ${tone} p-7 md:p-8`} aria-label={r.name}>
      <div className="flex flex-wrap items-center gap-2">{badge}</div>
      <h3 className="mt-3 text-2xl font-bold text-navy">{r.name}</h3>

      {r.result === "eligible" && (
        <ul className="mt-2 text-sm list-disc pl-5">{rules.filter((x) => x.outcome === "pass").map((x, i) => <li key={i}>{x.message}</li>)}</ul>
      )}
      {r.result === "not_eligible" && (
        <div className="mt-2 text-sm">
          <p className="text-muted-foreground">Reason:</p>
          <ul className="list-disc pl-5">{rules.filter((x) => x.outcome === "fail").map((x, i) => <li key={i}>{x.message}</li>)}</ul>
        </div>
      )}
      {r.result === "need_more_info" && (
        <div className="mt-2 text-sm space-y-2">
          {r.missing_fields.length > 0 && (
            <p>Answer to decide: <strong>{r.missing_fields.map((f) => FIELD_LABELS[f] ?? f).join(", ")}</strong></p>
          )}
          {r.manual_checks.length > 0 && (
            <div>
              <p className="text-muted-foreground">Confirm with the official scheme office:</p>
              <ul className="list-disc pl-5">{r.manual_checks.map((m) => <li key={m}>{m}</li>)}</ul>
            </div>
          )}
        </div>
      )}
      {r.result !== "rules_not_verified" && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <Link to={`/schemes/${r.scheme_id}`} className="inline-flex items-center gap-3 font-medium hover:underline">
            <span className="arrow-circle" aria-hidden="true">→</span>
            Benefits, documents and how to apply
          </Link>
          <ApplyLink url={info?.apply_link ?? null} />
        </div>
      )}
    </article>
  );
}

function FollowUp({ fields, onAnswer }: { fields: string[]; onAnswer: (field: string, value: boolean | number) => void }) {
  const yesNo = fields.filter((f) => FOLLOW_UP_QUESTIONS[f]?.kind === "yesno");
  if (yesNo.length === 0) return null;
  return (
    <section className="card card-navy p-7 md:p-8" aria-labelledby="followup-heading">
      <h2 id="followup-heading" className="text-2xl font-medium"><span className="highlight">A few more questions</span></h2>
      <p className="mt-3 text-sm text-white/80">
        Optional. These help decide some schemes. Health answers are used only for this check and are never stored.
      </p>
      <div className="mt-6 space-y-5">
        {yesNo.map((f) => (
          <fieldset key={f}>
            <legend className="font-medium">{FOLLOW_UP_QUESTIONS[f].question}</legend>
            <div className="mt-3 flex gap-3">
              <Button type="button" variant="accent" onClick={() => onAnswer(f, true)}>Yes</Button>
              <Button type="button" variant="outline" onClick={() => onAnswer(f, false)}>No</Button>
            </div>
          </fieldset>
        ))}
      </div>
    </section>
  );
}

export default function Results() {
  const navigate = useNavigate();
  // Answers live in app memory only; a reload clears them and returns to the questionnaire.
  const { profile, setProfile, setChecklistIds } = useAnswers();
  const [results, setResults] = useState<SchemeCheckResult[] | null>(null);
  const [disclaimer, setDisclaimer] = useState("");
  const [error, setError] = useState(false);
  const [schemeInfo, setSchemeInfo] = useState<Record<string, SchemeSummary>>({});
  const [level, setLevel] = useState<LevelFilter>("all");

  // Level, state and verified apply link come from the published scheme list.
  useEffect(() => {
    api.listSchemes()
      .then((r) => setSchemeInfo(Object.fromEntries(r.schemes.map((s) => [s.scheme_id, s]))))
      .catch(() => setSchemeInfo({}));
  }, []);

  useEffect(() => {
    if (!profile) return;
    setError(false);
    api.checkEligibility(profile)
      .then((r) => { setResults(r.results); setDisclaimer(r.disclaimer); })
      .catch(() => setError(true));
  }, [profile]);

  const sorted = useMemo(() => [...(results ?? [])].sort((a, b) => ORDER[a.result] - ORDER[b.result]), [results]);
  const filtered = useMemo(
    () => sorted.filter((r) => level === "all" || (schemeInfo[r.scheme_id] && matchesLevel(schemeInfo[r.scheme_id], level))),
    [sorted, level, schemeInfo],
  );
  // Schemes worth preparing documents for: likely eligible, or needing more information.
  const checklistIds = useMemo(
    () => filtered.filter((r) => r.result === "eligible" || r.result === "need_more_info").map((r) => r.scheme_id),
    [filtered],
  );
  const missing = useMemo(
    () => [...new Set(sorted.filter((r) => r.result === "need_more_info").flatMap((r) => r.missing_fields))],
    [sorted],
  );

  if (!profile) return <Navigate to="/questionnaire" replace />;

  return (
    <div className="px-4 py-12">
      <div className="container-tight max-w-3xl space-y-6">
        <Link to="/questionnaire" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to Questionnaire
        </Link>
        <h1 className="text-4xl font-extrabold text-navy"><span className="highlight">Your Results</span></h1>
        {disclaimer && <p className="text-sm rounded-2xl border border-border bg-white p-4" role="note">{disclaimer}</p>}

        {error && <ErrorBox>We couldn't check eligibility right now. Please try again later.</ErrorBox>}
        {!error && results === null && <Loading label="Checking schemes..." />}

        {results !== null && (
          <>
            <FollowUp fields={missing} onAnswer={(f, v) => setProfile((p) => ({ ...p, [f]: v }))} />
            {sorted.length === 0 && <p className="text-muted-foreground">No reviewed schemes are available yet.</p>}
            {sorted.length > 0 && <LevelTabs value={level} onChange={setLevel} label="Filter results by level" />}
            {sorted.length > 0 && filtered.length === 0 && (
              <p className="text-muted-foreground" role="status">No reviewed schemes in this category yet.</p>
            )}
            <div className="space-y-4">
              {filtered.map((r) => <ResultCard key={r.scheme_id} r={r} info={schemeInfo[r.scheme_id]} />)}
            </div>
            {checklistIds.length > 0 && (
              <div className="card card-navy p-6 flex flex-wrap items-center justify-between gap-4">
                <p className="text-sm text-white/90">
                  Get one list of the official documents for the {checklistIds.length} scheme{checklistIds.length === 1 ? "" : "s"} you may qualify for.
                </p>
                <button type="button" className="btn btn-accent" onClick={() => { setChecklistIds(checklistIds); navigate("/checklist"); }}>
                  <ClipboardCheck className="h-4 w-4" aria-hidden="true" /> Build my document checklist
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
