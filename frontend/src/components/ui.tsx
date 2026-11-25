import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, ExternalLink, Loader2 } from "lucide-react";
import type { CitedItem, SchemeSummary } from "../api";
import { formatDate, tx, useT } from "../i18n";

// ----- Central / Karnataka filter -----

export type LevelFilter = "all" | "central" | "karnataka";

export const LEVEL_TABS: { value: LevelFilter; label: string }[] = [
  { value: "all", label: tx("All") },
  { value: "central", label: tx("Central") },
  { value: "karnataka", label: tx("Karnataka State") },
];

export function matchesLevel(s: Pick<SchemeSummary, "level" | "state">, filter: LevelFilter): boolean {
  if (filter === "central") return s.level === "central";
  if (filter === "karnataka") return s.level === "state" && s.state === "Karnataka";
  return true;
}

export function LevelTabs({ value, onChange, label }: { value: LevelFilter; onChange: (v: LevelFilter) => void; label?: string }) {
  const { t: tr } = useT();
  return (
    <div role="tablist" aria-label={label ?? tr("Filter schemes")} className="inline-flex rounded-lg bg-white p-1 shadow-sm border border-border">
      {LEVEL_TABS.map((t) => (
        <button
          key={t.value}
          role="tab"
          type="button"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={`rounded-md px-4 py-2 text-sm font-semibold ${value === t.value ? "bg-navy text-white" : "text-navy hover:bg-muted"}`}
        >
          {tr(t.label)}
        </button>
      ))}
    </div>
  );
}

// ----- Official apply link (only a verified URL from the API; never generated) -----

export function ApplyLink({ url, light = false }: { url: string | null; light?: boolean }) {
  const { t } = useT();
  if (!url) {
    return <span className={`text-sm ${light ? "text-white/80" : "text-muted-foreground"}`}>{t("Link not available")}</span>;
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={`btn ${light ? "btn-accent" : "btn-primary"} py-2 px-4 text-sm`}>
      {t("Apply on Official Website")} <ExternalLink className="h-4 w-4" aria-hidden="true" />
      <span className="sr-only">{t("(opens in a new tab)")}</span>
    </a>
  );
}

/** "Last checked" date of a scheme's official sources (item 4: shows users how fresh the information is). */
export function LastChecked({ date, light = false }: { date: string; light?: boolean }) {
  const { t, lang } = useT();
  if (!date) return null;
  return <p className={`text-xs ${light ? "text-white/75" : "text-muted-foreground"}`}>{t("Sources last checked: {date}", { date: formatDate(date, lang) })}</p>;
}

export function SchemeCard({ scheme }: { scheme: SchemeSummary; index?: number }) {
  const { t } = useT();
  return (
    <article className="card card-blue card-hover p-8 flex flex-col gap-4 min-h-[15rem]" aria-label={scheme.name}>
      <div className="flex flex-wrap gap-2">
        <span className="badge bg-white/20 text-white">{t(scheme.level === "central" ? "Central" : "State")}</span>
        {scheme.state && <span className="badge bg-white/20 text-white">{scheme.state}</span>}
      </div>
      <h3 className="text-xl font-bold leading-snug">{scheme.name}</h3>
      <p className="text-sm text-white/90">{scheme.issuing_body}</p>
      <LastChecked date={scheme.last_checked} light />
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
        <Link to={`/schemes/${scheme.scheme_id}`} className="inline-flex items-center gap-2 font-semibold text-yellow hover:underline">
          {t("View details")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        <ApplyLink url={scheme.apply_link} light />
      </div>
    </article>
  );
}

/** Section heading with the key word underlined in yellow. */
export function SectionTitle({ title, highlight, children, id, light = false }: { title: string; highlight?: string; children?: ReactNode; id?: string; light?: boolean }) {
  const parts = highlight && title.includes(highlight) ? title.split(highlight) : [title];
  return (
    <div className="text-center max-w-2xl mx-auto">
      <h2 id={id} className={`text-3xl md:text-4xl font-extrabold ${light ? "text-white" : "text-navy"}`}>
        {parts.length > 1 ? (<>{parts[0]}<span className="highlight">{highlight}</span>{parts[1]}</>) : title}
      </h2>
      {children && <p className={`mt-4 ${light ? "text-white/80" : "text-muted-foreground"}`}>{children}</p>}
    </div>
  );
}

export function Citation({ item }: { item: Pick<CitedItem, "page" | "section"> }) {
  const { t } = useT();
  const where = [item.page ? t("page {n}", { n: item.page }) : null, item.section].filter(Boolean).join(", ");
  return where ? <span className="text-xs text-muted-foreground"> {t("(Source: {where})", { where })}</span> : null;
}

export function Loading({ label }: { label?: string }) {
  const { t } = useT();
  return (
    <p className="flex items-center gap-2 text-muted-foreground" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {label ?? t("Loading...")}
    </p>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  const { t } = useT();
  return (
    <div className="card card-sm p-6 flex gap-3 border-destructive/30" role="alert">
      <AlertTriangle className="h-5 w-5 text-destructive shrink-0" aria-hidden="true" />
      <div className="text-sm">
        {children}
        <p className="mt-2">
          {t("You can also check official portals such as")}{" "}
          <a className="text-blue underline font-medium" href="https://www.myscheme.gov.in/" target="_blank" rel="noreferrer">
            MyScheme.gov.in
          </a>
          .
        </p>
      </div>
    </div>
  );
}

export function Button({ children, variant = "primary", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "accent" }) {
  const style = { primary: "btn-primary", outline: "btn-outline", accent: "btn-accent" }[variant];
  return (
    <button {...props} className={`btn ${style} disabled:opacity-40 disabled:cursor-not-allowed ${props.className ?? ""}`}>
      {children}
    </button>
  );
}
