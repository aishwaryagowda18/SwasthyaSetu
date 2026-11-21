import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { Profile } from "../api";
import { AREAS, CATEGORIES, GENDERS, OCCUPATIONS, STATES } from "../options";
import { Button } from "../components/ui";

const STEPS = ["Personal", "Location", "Financial", "Occupation"] as const;

// Form values are kept as text so "not answered" stays empty, never 0 or "no".
type Form = Record<"age" | "gender" | "has_disability" | "state" | "area_type" | "annual_family_income" | "social_category" | "occupation", string>;
const EMPTY: Form = { age: "", gender: "", has_disability: "", state: "", area_type: "", annual_family_income: "", social_category: "", occupation: "" };

export function toProfile(form: Form): Profile {
  const p: Profile = {};
  if (form.age !== "") p.age = Number(form.age);
  if (form.gender) p.gender = form.gender as Profile["gender"];
  if (form.has_disability) p.has_disability = form.has_disability === "yes";
  if (form.state) p.state = form.state;
  if (form.area_type) p.area_type = form.area_type as Profile["area_type"];
  if (form.annual_family_income !== "") p.annual_family_income = Number(form.annual_family_income);
  if (form.social_category) p.social_category = form.social_category as Profile["social_category"];
  if (form.occupation) p.occupation = form.occupation;
  return p;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium">{label}</span>
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

const inputCls = "field";

function Select({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string }) {
  return (
    <select aria-label={label} className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Prefer not to say</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export default function Questionnaire() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(EMPTY);
  const set = (key: keyof Form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const ageInvalid = form.age !== "" && (!Number.isInteger(Number(form.age)) || Number(form.age) < 0 || Number(form.age) > 120);
  const incomeInvalid = form.annual_family_income !== "" && (!Number.isInteger(Number(form.annual_family_income)) || Number(form.annual_family_income) < 0);
  const invalid = (step === 0 && ageInvalid) || (step === 2 && incomeInvalid);

  const next = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else navigate("/results", { state: { profile: toProfile(form) } }); // kept in memory only
  };

  return (
    <div className="px-4 py-10 md:py-14">
      <div className="container-tight max-w-2xl">
        <ol className="grid grid-cols-4 gap-2 text-xs md:text-sm font-medium" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s} aria-current={i === step ? "step" : undefined}
              className={`rounded-full border border-border px-2 py-2 text-center ${i < step ? "bg-navy text-white border-navy" : i === step ? "bg-blue text-white border-blue" : "bg-white text-muted-foreground"}`}>
              {i + 1}. {s}
            </li>
          ))}
        </ol>

        <form className="card card-soft mt-8 p-8 md:p-10 space-y-6" onSubmit={(e) => { e.preventDefault(); if (!invalid) next(); }}>
          <h1 className="text-3xl font-extrabold text-navy">
            <span className="highlight">{["Tell us about yourself", "Where do you live?", "Financial details", "Occupation"][step]}</span>
          </h1>
          <p className="text-sm text-muted-foreground">Every question is optional. Your answers are not stored.</p>

          {step === 0 && (
            <>
              <Field label="Age">
                <input className={inputCls} type="number" inputMode="numeric" min={0} max={120} placeholder="Enter your age"
                  value={form.age} onChange={(e) => set("age")(e.target.value)} aria-invalid={ageInvalid} />
              </Field>
              {ageInvalid && <p className="text-sm text-destructive" role="alert">Please enter a whole number from 0 to 120.</p>}
              <Field label="Gender"><Select label="Gender" value={form.gender} onChange={set("gender")} options={GENDERS} /></Field>
              <Field label="Do you have a disability?">
                <Select label="Do you have a disability?" value={form.has_disability} onChange={set("has_disability")}
                  options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} />
              </Field>
            </>
          )}
          {step === 1 && (
            <>
              <Field label="State / UT">
                <Select label="State / UT" value={form.state} onChange={set("state")} options={STATES.map((s) => ({ value: s, label: s }))} />
              </Field>
              <Field label="Area Type"><Select label="Area Type" value={form.area_type} onChange={set("area_type")} options={AREAS} /></Field>
            </>
          )}
          {step === 2 && (
            <>
              <Field label="Annual Household Income (₹)" hint="Total yearly income of your family">
                <input className={inputCls} type="number" inputMode="numeric" min={0} placeholder="e.g. 150000"
                  value={form.annual_family_income} onChange={(e) => set("annual_family_income")(e.target.value)} aria-invalid={incomeInvalid} />
              </Field>
              {incomeInvalid && <p className="text-sm text-destructive" role="alert">Please enter a whole number of rupees.</p>}
              <Field label="Category"><Select label="Category" value={form.social_category} onChange={set("social_category")} options={CATEGORIES} /></Field>
            </>
          )}
          {step === 3 && (
            <Field label="Occupation"><Select label="Occupation" value={form.occupation} onChange={set("occupation")} options={OCCUPATIONS} /></Field>
          )}

          <div className="flex justify-between pt-2">
            <Button type="button" variant="outline" onClick={() => setStep(step - 1)} disabled={step === 0}>Back</Button>
            <Button type="submit" disabled={invalid}>{step === STEPS.length - 1 ? "See Results" : "Next"}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
