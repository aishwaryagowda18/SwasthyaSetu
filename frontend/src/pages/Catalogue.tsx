import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, Search } from "lucide-react";
import { catalogueApi, type CatalogueFacets, type CataloguePage } from "../api";
import { ErrorBox, Loading } from "../components/ui";
import { tx, useT } from "../i18n";

export function UnverifiedBanner({ text }: { text: string }) {
  const { t } = useT();
  return (
    <div className="card card-accent p-4 flex gap-3" role="note" aria-label={t("Unverified information")}>
      <AlertTriangle className="h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
      <p className="text-sm"><strong>{t("Unverified.")}</strong> {t(text)}</p>
    </div>
  );
}

const LEVELS = [{ value: "", label: tx("All") }, { value: "central", label: tx("Central") }, { value: "state", label: tx("Karnataka") }];

/** All schemes from the unverified catalogue (search and filters). Never used for eligibility. */
export default function Catalogue() {
  const [facets, setFacets] = useState<CatalogueFacets | null>(null);
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [level, setLevel] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CataloguePage | null>(null);
  const [error, setError] = useState(false);
  const { t } = useT();

  useEffect(() => { catalogueApi.facets().then(setFacets).catch(() => setFacets(null)); }, []);
  useEffect(() => {
    setError(false);
    catalogueApi.search({ q, level, category, page }).then(setData).catch(() => setError(true));
  }, [q, level, category, page]);

  const reset = (fn: () => void) => { fn(); setPage(1); };
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="px-4 py-12">
      <div className="container-tight space-y-6">
        <div>
          <h1 className="text-4xl font-extrabold text-navy">{t("All")} <span className="highlight">{t("Schemes")}</span></h1>
          <p className="mt-2 text-muted-foreground">
            {facets ? t("{n} central and Karnataka schemes from a public dataset.", { n: facets.count.toLocaleString("en-IN") }) : t("Central and Karnataka schemes from a public dataset.")}{" "}
            {t("Data as of January 2025.")}{" "}
            {t("For checked information, see the")} <Link to="/#schemes" className="text-blue underline">{t("reviewed schemes")}</Link>.
          </p>
        </div>
        {data && <UnverifiedBanner text={data.warning} />}

        <form className="card p-5 grid gap-4 md:grid-cols-4" onSubmit={(e) => { e.preventDefault(); reset(() => setQ(input.trim())); }} role="search">
          <label className="relative md:col-span-3">
            <span className="sr-only">{t("Search all schemes")}</span>
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <input className="field pl-11" type="search" placeholder={t("Search central and Karnataka schemes, e.g. maternity, scholarship")} value={input}
              onChange={(e) => setInput(e.target.value)} maxLength={200} />
          </label>
          <label>
            <span className="sr-only">{t("Category")}</span>
            <select aria-label={t("Category")} className="field" value={category} onChange={(e) => reset(() => setCategory(e.target.value))}>
              <option value="">{t("All categories")}</option>
              {facets?.categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <div className="md:col-span-4 flex flex-wrap items-center justify-between gap-3">
            <div role="tablist" aria-label={t("Level")} className="inline-flex rounded-lg bg-white p-1 border border-border">
              {LEVELS.map((l) => (
                <button key={l.value} role="tab" type="button" aria-selected={level === l.value}
                  onClick={() => reset(() => setLevel(l.value))}
                  className={`rounded-md px-4 py-2 text-sm font-semibold ${level === l.value ? "bg-navy text-white" : "text-navy hover:bg-muted"}`}>
                  {t(l.label)}
                </button>
              ))}
            </div>
            <button type="submit" className="btn btn-primary py-2">{t("Search")}</button>
          </div>
        </form>

        {error && <ErrorBox>{t("We couldn't load schemes right now.")}</ErrorBox>}
        {!error && !data && <Loading label={t("Loading schemes...")} />}
        {data && (
          <>
            <p className="text-sm text-muted-foreground" role="status">{t(data.total === 1 ? tx("1 scheme found") : tx("{n} schemes found"), { n: data.total.toLocaleString("en-IN") })}</p>
            <ul className="grid gap-4 md:grid-cols-2">
              {data.results.map((s) => (
                <li key={s.id} className="card p-5 flex flex-col gap-2">
                  <div className="flex flex-wrap gap-2">
                    <span className="badge badge-info">{t("Unverified")}</span>
                    <span className="badge">{t(s.level === "central" ? "Central" : "State")}</span>
                    {s.state && <span className="badge">{s.state}</span>}
                  </div>
                  <h2 className="text-lg font-bold text-navy">{s.name}</h2>
                  <p className="text-sm text-muted-foreground line-clamp-3">{s.brief_description}</p>
                  <p className="text-xs text-muted-foreground">{t("Listed around January 2025 · not checked")}</p>
                  <div className="mt-auto flex flex-wrap gap-4 text-sm font-semibold">
                    <Link to={`/catalogue/${s.id}`} className="inline-flex items-center gap-1 text-blue hover:underline">
                      {t("View details")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                    {s.reviewed_scheme_id && (
                      <Link to={`/schemes/${s.reviewed_scheme_id}`} className="text-success hover:underline">{t("Reviewed version available")}</Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {data.total > data.page_size && (
              <nav className="flex items-center justify-center gap-3" aria-label={t("Pages")}>
                <button type="button" className="btn btn-outline py-2" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("Previous")}</button>
                <span className="text-sm">{t("Page {page} of {pages}", { page, pages })}</span>
                <button type="button" className="btn btn-outline py-2" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t("Next")}</button>
              </nav>
            )}
          </>
        )}
      </div>
    </div>
  );
}
