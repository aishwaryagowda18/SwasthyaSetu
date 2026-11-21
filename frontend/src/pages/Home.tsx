import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ClipboardList, FileCheck2, HeartPulse, Lock, Pill, Search, ShieldCheck, Sparkles, Stethoscope } from "lucide-react";
import { api, type SchemeSummary } from "../api";
import { ErrorBox, LevelTabs, Loading, SchemeCard, SectionTitle, matchesLevel, type LevelFilter } from "../components/ui";

const STEPS = [
  { icon: ClipboardList, title: "Answer Questions", text: "Tell us your age, state, income and a few other details. Skip anything you don't want to share." },
  { icon: Sparkles, title: "Rule-based Matching", text: "Fixed, tested rules check each scheme. Results never come from guesswork." },
  { icon: FileCheck2, title: "Get Results", text: "See benefits, documents needed and what still needs an official check, with sources." },
];

const WHY = [
  { icon: ShieldCheck, title: "Official sources only", text: "Every fact links to a government document or page, and is reviewed by a person before it is shown." },
  { icon: Lock, title: "Private by design", text: "No sign-up. Your answers are used once to check eligibility and are never stored." },
  { icon: FileCheck2, title: "Honest results", text: "If something can't be decided from your answers, we say so and tell you what to check." },
];

function HeroArt() {
  // Decorative dashboard-style composition (no real data).
  return (
    <div className="relative mx-auto w-full max-w-md" aria-hidden="true">
      <div className="card p-5 text-foreground">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-sky" /><span className="h-3 w-3 rounded-full bg-yellow" /><span className="h-3 w-3 rounded-full bg-blue" />
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="col-span-2 rounded-lg bg-muted p-4">
            <div className="h-2 w-24 rounded bg-sky" />
            <div className="mt-4 flex items-end gap-2 h-20">
              {[40, 65, 50, 80, 60, 90].map((h, i) => <span key={i} className="w-4 rounded-t bg-blue" style={{ height: `${h}%` }} />)}
            </div>
          </div>
          <div className="rounded-lg bg-yellow grid place-items-center"><HeartPulse className="h-10 w-10 text-navy" /></div>
          <div className="rounded-lg bg-muted p-3 grid place-items-center"><Stethoscope className="text-blue" /></div>
          <div className="col-span-2 rounded-lg bg-muted p-3 space-y-2">
            <div className="h-2 w-full rounded bg-sky" /><div className="h-2 w-3/4 rounded bg-sky" /><div className="h-2 w-1/2 rounded bg-blue" />
          </div>
        </div>
      </div>
      <span className="absolute -top-5 -right-3 grid place-items-center h-14 w-14 rounded-full bg-yellow text-navy shadow-lg"><ShieldCheck /></span>
      <span className="absolute -bottom-5 -left-4 grid place-items-center h-14 w-14 rounded-full bg-blue text-white shadow-lg"><Pill /></span>
    </div>
  );
}

export default function Home() {
  const [schemes, setSchemes] = useState<SchemeSummary[] | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<LevelFilter>("all");

  useEffect(() => {
    api.listSchemes().then((r) => setSchemes(r.schemes)).catch(() => setError(true));
  }, []);

  // Search and the Central/Karnataka tabs work together.
  const shown = useMemo(
    () => (schemes ?? []).filter((s) =>
      matchesLevel(s, level) && `${s.name} ${s.issuing_body}`.toLowerCase().includes(query.trim().toLowerCase())),
    [schemes, query, level],
  );

  return (
    <>
      {/* Hero */}
      <section className="band-navy">
        <div className="container-tight px-4 md:px-6 py-16 md:py-24 grid md:grid-cols-2 items-center gap-14">
          <div>
            <span className="badge bg-white/15 text-white">Central &amp; Karnataka public health schemes</span>
            <h1 className="mt-6 text-4xl md:text-5xl font-extrabold leading-tight">
              Find Health Schemes You May Be Eligible For
            </h1>
            <p className="mt-6 text-lg text-white/85 max-w-lg">
              Answer a few simple questions and see which public health schemes may apply to you, what they offer and
              how to apply. Free, and based on official government sources.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/questionnaire" className="btn btn-primary">Check Your Eligibility <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
              <a href="#how-it-works" className="btn btn-ghost-light">How it Works</a>
            </div>
          </div>
          <HeroArt />
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="container-tight px-4 md:px-6 py-20 scroll-mt-20">
        <SectionTitle title="How SchemeSathi Works" highlight="Works">Three simple steps from questions to clear, sourced answers.</SectionTitle>
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <div key={title} className="card card-blue p-8">
              <div className="flex items-center justify-between">
                <Icon className="h-8 w-8 text-yellow" aria-hidden="true" />
                <span className="text-xs font-bold tracking-wide text-yellow">STEP {i + 1}</span>
              </div>
              <h3 className="mt-4 text-xl font-bold">{title}</h3>
              <p className="mt-3 text-sm text-white/90">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Schemes */}
      <section id="schemes" className="bg-muted scroll-mt-20" aria-labelledby="schemes-heading">
        <div className="container-tight px-4 md:px-6 py-20">
          <SectionTitle title="Reviewed Schemes" highlight="Schemes" id="schemes-heading">
            Only schemes checked against official sources by a person are listed.
          </SectionTitle>
          <div className="mt-8 flex flex-col md:flex-row items-center justify-center gap-4">
            <LevelTabs value={level} onChange={setLevel} label="Filter schemes by level" />
            <label className="relative block w-full max-w-md">
              <span className="sr-only">Search schemes</span>
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <input type="search" placeholder="Search schemes..." value={query} onChange={(e) => setQuery(e.target.value)} className="field pl-11" />
            </label>
          </div>
          <div className="mt-10">
            {error && <ErrorBox>We couldn't load the scheme list right now.</ErrorBox>}
            {!error && schemes === null && <Loading label="Loading schemes..." />}
            {schemes !== null && shown.length === 0 && <p className="text-center text-muted-foreground">No schemes found.</p>}
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {shown.map((s) => <SchemeCard key={s.scheme_id} scheme={s} />)}
            </div>
            {schemes !== null && (
              <p className="mt-8 text-center text-sm text-muted-foreground">
                More central and Karnataka schemes are being checked and will appear here once reviewed.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Why */}
      <section className="container-tight px-4 md:px-6 py-20">
        <SectionTitle title="Why SchemeSathi?" highlight="SchemeSathi">Built for trust: official sources, privacy and honest answers.</SectionTitle>
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {WHY.map(({ icon: Icon, title, text }) => (
            <div key={title} className="card card-blue p-8">
              <Icon className="h-8 w-8 text-yellow" aria-hidden="true" />
              <h3 className="mt-4 text-xl font-bold">{title}</h3>
              <p className="mt-3 text-sm text-white/90">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="band-navy">
        <div className="container-tight px-4 md:px-6 py-16 text-center">
          <h2 className="text-3xl md:text-4xl font-extrabold">Ready to Find Your <span className="highlight">Schemes?</span></h2>
          <p className="mt-4 text-white/85">It takes about 2 minutes. No registration needed.</p>
          <Link to="/questionnaire" className="btn btn-primary mt-8">Start Now <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </div>
      </section>
    </>
  );
}
