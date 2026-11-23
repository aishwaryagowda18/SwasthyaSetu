import { useMemo, useState } from "react";
import { CheckCircle2, Circle, Printer } from "lucide-react";
import { Citation } from "./ui";

export interface ChecklistItem {
  key: string;
  name: string;
  /** Where the requirement comes from (one entry per scheme that needs it). */
  sources: { scheme?: string; page: number | null; section: string | null }[];
}

/**
 * Interactive checklist of official required documents.
 * Ticks are kept in memory only: never sent to the server or saved in the browser.
 * There is deliberately no upload option.
 */
export default function DocumentChecklist({ items, title = "Document checklist", showSchemes = false, printHeading }: {
  items: ChecklistItem[];
  title?: string;
  showSchemes?: boolean;
  /** Shown only on paper, so a printed checklist says which scheme it is for. */
  printHeading?: string;
}) {
  const [have, setHave] = useState<Set<string>>(new Set());
  const missing = useMemo(() => items.filter((i) => !have.has(i.key)), [items, have]);
  const ready = items.length - missing.length;

  const toggle = (key: string) =>
    setHave((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <section className="card card-soft p-7 md:p-8 space-y-5" aria-labelledby="checklist-heading" id="checklist">
      {printHeading && <p className="hidden print:block text-lg font-bold">{printHeading}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="checklist-heading" className="text-xl font-bold text-navy"><span className="highlight">{title}</span></h2>
        <button type="button" onClick={() => window.print()} className="btn btn-outline py-2 px-3 text-sm print:hidden">
          <Printer className="h-4 w-4" aria-hidden="true" /> Print checklist
        </button>
      </div>

      <div>
        <p className="text-sm font-semibold" role="status" aria-live="polite">
          {ready} of {items.length} document{items.length === 1 ? "" : "s"} ready
        </p>
        <div className="mt-2 h-2 rounded-full bg-white border border-border overflow-hidden" aria-hidden="true">
          <div className="h-full bg-blue transition-all" style={{ width: `${items.length ? (ready / items.length) * 100 : 0}%` }} />
        </div>
      </div>

      <ul className="space-y-3">
        {items.map((item) => {
          const checked = have.has(item.key);
          return (
            <li key={item.key} className="rounded-lg bg-white border border-border p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-[#4f9cf9]" checked={checked} onChange={() => toggle(item.key)} />
                <span className="text-sm">
                  <span className={`font-medium ${checked ? "line-through text-muted-foreground" : ""}`}>{item.name}</span>
                  <span className="sr-only">{checked ? " (I have this)" : " (still needed)"}</span>
                  {item.sources.map((s, n) => (
                    <span key={n} className="block text-xs text-muted-foreground">
                      {showSchemes && s.scheme ? `Needed for ${s.scheme}` : "Official requirement"}
                      <Citation item={s} />
                    </span>
                  ))}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {items.length > 0 && (
        <div className="rounded-lg bg-white border border-border p-4 text-sm" aria-label="Checklist summary">
          {missing.length === 0 ? (
            <p className="flex items-center gap-2 font-semibold text-success">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> You have marked all listed documents as ready.
            </p>
          ) : (
            <>
              <p className="font-semibold">Still needed ({missing.length}):</p>
              <ul className="mt-1 space-y-1">
                {missing.map((m) => (
                  <li key={m.key} className="flex items-start gap-2"><Circle className="h-3 w-3 mt-1 shrink-0" aria-hidden="true" />{m.name}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Your ticks are not saved or sent anywhere; they disappear when you close this page. Keep the original documents
        with you; SchemeSathi never asks you to upload them. Confirm the final list with the scheme office.
      </p>
    </section>
  );
}

/** Merge documents with exactly the same name (ignoring case, spaces and punctuation). Never guesses similarity. */
export function normalizeDocName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
