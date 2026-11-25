import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { ApiError, catalogueApi, type CatalogueEntry as Entry } from "../api";
import { ErrorBox, Loading } from "../components/ui";
import { UnverifiedBanner } from "./Catalogue";
import { tx, useT } from "../i18n";

/** Strip markdown-like markers from the dataset text so it reads as plain text. */
function plain(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1 ($2)")
    .replace(/\*\*|__/g, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .trim();
}

function Block({ title, text }: { title: string; text: string }) {
  const { t } = useT();
  if (!text.trim()) return null;
  return (
    <section className="card p-6">
      <h2 className="text-lg font-bold text-navy">{t(title)}</h2>
      <p className="mt-3 text-sm whitespace-pre-line">{plain(text)}</p>
    </section>
  );
}

export default function CatalogueEntry() {
  const { entryId = "" } = useParams();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [error, setError] = useState<"notfound" | "other" | null>(null);
  const { t, lang } = useT();

  useEffect(() => {
    setEntry(null);
    setError(null);
    catalogueApi.entry(entryId).then(setEntry).catch((e) => setError(e instanceof ApiError && e.status === 404 ? "notfound" : "other"));
  }, [entryId]);

  return (
    <div className="px-4 py-12">
      <div className="container-tight max-w-3xl space-y-5">
        <Link to="/catalogue" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t("All schemes")}
        </Link>
        {error === "notfound" && <ErrorBox>{t("Scheme not found.")}</ErrorBox>}
        {error === "other" && <ErrorBox>{t("We couldn't load this scheme right now.")}</ErrorBox>}
        {!error && !entry && <Loading />}
        {entry && (
          <>
            <UnverifiedBanner text={entry.warning} />
            <header>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="badge badge-info">{t("Unverified")}</span>
                <span className="badge">{t(entry.level === "central" ? "Central" : "State")}</span>
                {entry.state && <span className="badge">{entry.state}</span>}
              </div>
              <h1 className="mt-4 text-3xl font-extrabold text-navy leading-tight">{entry.name}</h1>
              {entry.ministry && <p className="mt-1 text-muted-foreground">{entry.ministry}</p>}
              {entry.reviewed_scheme_id && (
                <Link to={`/schemes/${entry.reviewed_scheme_id}`} className="mt-3 inline-block font-semibold text-success underline">
                  {t("A reviewed version of this scheme is available")} →
                </Link>
              )}
              {entry.corrupted_text && (
                <p className="mt-2 text-xs text-muted-foreground">{t("Some characters in this record were damaged in the source data and are shown as �.")}</p>
              )}
              {lang === "kn" && <p className="mt-2 text-xs text-muted-foreground">{t("Scheme details are shown in English, as written in the source.")}</p>}
            </header>
            <Block title={tx("About")} text={entry.detailed_description || entry.brief_description} />
            <Block title={tx("Who can apply (as listed)")} text={entry.eligibility_text} />
            <Block title={tx("Benefits (as listed)")} text={entry.benefits_text} />
            <Block title={tx("Documents (as listed)")} text={entry.documents_text} />
            <Block title={tx("How to apply (as listed)")} text={entry.application_text} />
            {entry.official_website && (
              <section className="card p-6 text-sm">
                <h2 className="text-lg font-bold text-navy">{t("Website listed in the data")}</h2>
                <p className="mt-1 text-muted-foreground">{t("Not verified. Check that it is an official government website before using it.")}</p>
                <a href={entry.official_website} target="_blank" rel="noopener noreferrer nofollow" className="mt-2 inline-flex items-center gap-1 break-all text-blue underline">
                  {entry.official_website} <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                </a>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
