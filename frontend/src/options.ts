import { tx } from "./i18n";

// Answer choices. Labels are translated with t() where shown. Values must match the backend's allowed values (backend/app/models.py).

export const STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat",
  "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh",
  "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh",
  "Lakshadweep", "Puducherry",
];

export const GENDERS = [
  { value: "female", label: tx("Female") },
  { value: "male", label: tx("Male") },
  { value: "other", label: tx("Other") },
];

export const AREAS = [
  { value: "rural", label: tx("Rural") },
  { value: "urban", label: tx("Urban") },
];

export const CATEGORIES = [
  { value: "general", label: tx("General") },
  { value: "obc", label: tx("OBC") },
  { value: "sc", label: tx("SC") },
  { value: "st", label: tx("ST") },
  { value: "ews", label: tx("EWS") },
];

export const OCCUPATIONS = [
  { value: "farmer", label: tx("Farmer") },
  { value: "construction_worker", label: tx("Construction worker") },
  { value: "daily_wage_worker", label: tx("Daily wage worker") },
  { value: "salaried", label: tx("Salaried / employed") },
  { value: "self_employed", label: tx("Self-employed / business") },
  { value: "student", label: tx("Student") },
  { value: "homemaker", label: tx("Homemaker") },
  { value: "unemployed", label: tx("Unemployed") },
  { value: "retired", label: tx("Retired") },
  { value: "other", label: tx("Other") },
];

// Plain-language questions for answers a scheme may still need.
// Sensitive health questions are asked only when a scheme needs them.
export const FOLLOW_UP_QUESTIONS: Record<string, { question: string; kind: "yesno" | "number" | "choice"; sensitive?: boolean }> = {
  has_tb_diagnosis: { question: tx("Has a doctor diagnosed you with tuberculosis (TB)?"), kind: "yesno", sensitive: true },
  is_pregnant_or_lactating: { question: tx("Are you pregnant or breastfeeding?"), kind: "yesno", sensitive: true },
  has_disability: { question: tx("Do you have a disability?"), kind: "yesno" },
  age: { question: tx("What is your age?"), kind: "number" },
  annual_family_income: { question: tx("What is your family's yearly income (₹)?"), kind: "number" },
  gender: { question: tx("What is your gender?"), kind: "choice" },
  state: { question: tx("Which state or UT do you live in?"), kind: "choice" },
};

export const FIELD_LABELS: Record<string, string> = {
  age: tx("age"),
  gender: tx("gender"),
  state: tx("state"),
  area_type: tx("rural or urban area"),
  annual_family_income: tx("family income"),
  social_category: tx("social category"),
  occupation: tx("occupation"),
  has_disability: tx("disability"),
  is_pregnant_or_lactating: tx("pregnancy or breastfeeding"),
  has_tb_diagnosis: tx("TB diagnosis"),
};
