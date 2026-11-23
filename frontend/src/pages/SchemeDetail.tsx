import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ExternalLink, ShieldCheck } from "lucide-react";
import { api, ApiError, type CitedItem, type SchemeDetail as Detail } from "../api";
import { ApplyLink, Citation, ErrorBox, Loading } from "../components/ui";
import DocumentChecklist from "../components/DocumentChecklist";

function Section({ title, items, empty }: { title: string; items: CitedItem[]; empty?: string }) {
  if (items.length === 0 && !empty) return null;
  return (
    <section className="card card-soft p-7 md:p-8 print:hidden">
      <h2 className="text-xl font-bold text-navy"><span className="highlight">{title}</span></h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-4 space-y-2 list-disc pl-5">
          {items.map((i, n) => <li key={n}>{i.text}<Citation item={i} /></li>)}
        </ul>
      )}
    </section>
  );
}

export default function SchemeDetail() {
  const { schemeId = "" } = useParams();
  const [scheme, setScheme] = useState<Detail | null>(null);
  const [error, setError] = useState<"notfound" | "other" | null>(null);

  useEffect(() => {
    setScheme(null);
    setError(null);
    api.getScheme(schemeId).then(setScheme).catch((e) => setError(e instanceof ApiError && e.status === 404 ? "notfound" : "other"));
  }, [schemeId]);

  return (
    <div className="px-4 py-12">
      <div className="container-tight max-w-3xl space-y-5">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All schemes
        </Link>
        {error === "notfound" && (
          <ErrorBox>This scheme is not available. It may not have been reviewed against official sources yet.</ErrorBox>
        )}
        {error === "other" && <ErrorBox>We couldn't load this scheme right now.</ErrorBox>}
        {!error && !scheme && <Loading />}
        {scheme && (
          <>
            <header className="print:hidden">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="badge capitalize">{scheme.level}</span>
                {scheme.state && <span className="badge badge-no">{scheme.state}</span>}
                {scheme.human_reviewed && (
                  <span className="badge badge-eligible"><ShieldCheck className="h-3 w-3 mr-1" aria-hidden="true" />Reviewed against official sources</span>
                )}
              </div>
              <h1 className="mt-4 text-4xl font-extrabold text-navy leading-tight">{scheme.name}</h1>
              <p className="mt-1 text-muted-foreground">{scheme.issuing_body}</p>
              <p className="mt-1 text-xs text-muted-foreground">Sources last checked: {scheme.last_checked}</p>
              <div className="mt-4"><ApplyLink url={scheme.apply_link} /></div>
            </header>

            {scheme.notices.length > 0 && (
              <section className="card card-sm card-accent p-5 flex gap-3 print:hidden" role="note" aria-label="Details awaiting confirmation">
                <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
                <div className="text-sm">
                  <p className="font-medium">Some details are awaiting official confirmation</p>
                  <ul className="mt-1 list-disc pl-5">{scheme.notices.map((n) => <li key={n}>{n}</li>)}</ul>
                </div>
              </section>
            )}

            <Section title="Who can apply" items={scheme.eligibility} />
            <Section title="Benefits" items={scheme.benefits} />
            {scheme.required_documents.length > 0 ? (
              <DocumentChecklist
                title="Documents needed"
                printHeading={scheme.name}
                items={scheme.required_documents.map((d, n) => ({ key: `${n}`, name: d.text, sources: [{ page: d.page, section: d.section }] }))}
              />
            ) : (
              <Section title="Documents needed" items={[]} empty="Not yet confirmed from an official source. Ask the scheme office." />
            )}
            <Section title="How to apply" items={scheme.how_to_apply} empty="Not yet confirmed from an official source. Ask the scheme office." />
            {scheme.historical_benefits.length > 0 && <Section title="Earlier amounts (no longer current)" items={scheme.historical_benefits} />}

            <section className="card card-navy p-7 md:p-8 print:hidden">
              <h2 className="text-2xl font-medium"><span className="highlight">Official sources</span></h2>
              <ul className="mt-2 space-y-2 text-sm">
                {scheme.sources.map((s) => (
                  <li key={s.id}>
                    <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-yellow underline underline-offset-4">
                      {s.title} <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                    <span className="block text-xs text-white/70">Checked {s.checked_at}</span>
                  </li>
                ))}
              </ul>
            </section>
            <p className="text-sm rounded-2xl border border-border bg-white p-4" role="note">{scheme.disclaimer}</p>
          </>
        )}
      </div>
    </div>
  );
}
