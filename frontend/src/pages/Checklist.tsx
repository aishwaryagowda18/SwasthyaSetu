import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAnswers } from "../answers";
import { ArrowLeft } from "lucide-react";
import { api, type SchemeDetail } from "../api";
import DocumentChecklist, { normalizeDocName, type ChecklistItem } from "../components/DocumentChecklist";
import { ErrorBox, Loading } from "../components/ui";
import { useT } from "../i18n";

/** Combined document checklist for the schemes chosen on the results page (kept in memory only). */
export default function Checklist() {
  const { checklistIds: schemeIds } = useAnswers(); // app memory only
  const [details, setDetails] = useState<SchemeDetail[] | null>(null);
  const [error, setError] = useState(false);
  const { t } = useT();

  useEffect(() => {
    if (schemeIds.length === 0) return;
    Promise.all(schemeIds.map((id) => api.getScheme(id)))
      .then(setDetails)
      .catch(() => setError(true));
  }, [schemeIds.join(",")]); // re-run only when the chosen schemes change

  const { items, unconfirmed } = useMemo(() => {
    const merged = new Map<string, ChecklistItem>();
    const none: string[] = [];
    for (const d of details ?? []) {
      if (d.required_documents.length === 0) none.push(d.name);
      for (const doc of d.required_documents) {
        const key = normalizeDocName(doc.text); // exact same name only; never guessed
        const entry = merged.get(key) ?? { key, name: doc.text, sources: [] };
        entry.sources.push({ scheme: d.name, page: doc.page, section: doc.section });
        merged.set(key, entry);
      }
    }
    return { items: [...merged.values()], unconfirmed: none };
  }, [details]);

  return (
    <div className="px-4 py-12">
      <div className="container-tight max-w-3xl space-y-6">
        <Link to="/results" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t("Back")}
        </Link>
        <h1 className="text-4xl font-extrabold text-navy"><span className="highlight">{t("My Document Checklist")}</span></h1>

        {schemeIds.length === 0 && (
          <div className="card p-6 text-sm">
            <p>{t("No schemes selected yet.")}</p>
            <Link to="/questionnaire" className="mt-3 inline-block text-blue font-semibold underline">{t("Check your eligibility first")}</Link>
          </div>
        )}
        {error && <ErrorBox>{t("We couldn't load the document lists right now.")}</ErrorBox>}
        {schemeIds.length > 0 && !error && details === null && <Loading label={t("Loading document lists...")} />}

        {details !== null && (
          <>
            <p className="text-sm text-muted-foreground">
              {t("Documents for:")} <strong>{details.map((d) => d.name).join("; ")}</strong>.{" "}
              {t("Documents with exactly the same name are listed once.")}
            </p>
            {items.length > 0 && <DocumentChecklist items={items} title={t("Documents to prepare")} showSchemes />}
            <p className="text-sm rounded-2xl border border-border bg-white p-4" role="note">
              {t("This is not an official government service. Always confirm the documents with the scheme office before applying.")}
            </p>
            {unconfirmed.length > 0 && (
              <div className="card p-5 text-sm" role="note">
                <p className="font-semibold">{t("Documents not yet confirmed from an official source:")}</p>
                <ul className="mt-1 list-disc pl-5">{unconfirmed.map((n) => <li key={n}>{n} — {t("ask the scheme office.")}</li>)}</ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
