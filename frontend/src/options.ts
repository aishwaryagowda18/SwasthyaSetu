// Answer choices. Values must match the backend's allowed values (backend/app/models.py).

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
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "other", label: "Other" },
];

export const AREAS = [
  { value: "rural", label: "Rural" },
  { value: "urban", label: "Urban" },
];

export const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "obc", label: "OBC" },
  { value: "sc", label: "SC" },
  { value: "st", label: "ST" },
  { value: "ews", label: "EWS" },
];

export const OCCUPATIONS = [
  { value: "farmer", label: "Farmer" },
  { value: "construction_worker", label: "Construction worker" },
  { value: "daily_wage_worker", label: "Daily wage worker" },
  { value: "salaried", label: "Salaried / employed" },
  { value: "self_employed", label: "Self-employed / business" },
  { value: "student", label: "Student" },
  { value: "homemaker", label: "Homemaker" },
  { value: "unemployed", label: "Unemployed" },
  { value: "retired", label: "Retired" },
  { value: "other", label: "Other" },
];

// Plain-language questions for answers a scheme may still need.
// Sensitive health questions are asked only when a scheme needs them.
export const FOLLOW_UP_QUESTIONS: Record<string, { question: string; kind: "yesno" | "number" | "choice"; sensitive?: boolean }> = {
  has_tb_diagnosis: { question: "Has a doctor diagnosed you with tuberculosis (TB)?", kind: "yesno", sensitive: true },
  is_pregnant_or_lactating: { question: "Are you pregnant or breastfeeding?", kind: "yesno", sensitive: true },
  has_disability: { question: "Do you have a disability?", kind: "yesno" },
  age: { question: "What is your age?", kind: "number" },
  annual_family_income: { question: "What is your family's yearly income (₹)?", kind: "number" },
  gender: { question: "What is your gender?", kind: "choice" },
  state: { question: "Which state or UT do you live in?", kind: "choice" },
};

export const FIELD_LABELS: Record<string, string> = {
  age: "age",
  gender: "gender",
  state: "state",
  area_type: "rural or urban area",
  annual_family_income: "family income",
  social_category: "social category",
  occupation: "occupation",
  has_disability: "disability",
  is_pregnant_or_lactating: "pregnancy or breastfeeding",
  has_tb_diagnosis: "TB diagnosis",
};
