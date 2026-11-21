// Typed client for the SchemeSaathi FastAPI backend. All calls go to /api (proxied in development).

export type SchemeResult = "eligible" | "not_eligible" | "need_more_info" | "rules_not_verified";
export type Outcome = "pass" | "fail" | "unknown";

export interface Profile {
  age?: number;
  gender?: "female" | "male" | "other";
  state?: string;
  area_type?: "rural" | "urban";
  annual_family_income?: number;
  social_category?: "general" | "obc" | "sc" | "st" | "ews";
  occupation?: string;
  has_disability?: boolean;
  is_pregnant_or_lactating?: boolean;
  has_tb_diagnosis?: boolean;
}

export interface RuleResult {
  field: string | null;
  operator: string;
  outcome: Outcome;
  message: string;
  source_id: string;
  page: number | null;
  section: string | null;
}

export interface SchemeCheckResult {
  scheme_id: string;
  name: string;
  version: number;
  result: SchemeResult;
  missing_fields: string[];
  manual_checks: string[];
  groups: { key: string; mode: "all" | "any"; outcome: Outcome; rules: RuleResult[] }[];
}

export interface EligibilityResponse {
  disclaimer: string;
  sample_data: boolean;
  results: SchemeCheckResult[];
}

export interface SchemeSummary {
  scheme_id: string;
  name: string;
  level: string;
  state: string | null;
  issuing_body: string;
  last_checked: string;
  apply_link: string | null; // verified official application URL, or null
}

export interface CitedItem {
  text: string;
  source_id: string;
  page: number | null;
  section: string | null;
}

export interface SchemeDetail extends SchemeSummary {
  eligibility: CitedItem[];
  benefits: CitedItem[];
  historical_benefits: CitedItem[];
  required_documents: CitedItem[];
  how_to_apply: CitedItem[];
  notices: string[];
  sources: { id: string; title: string; url: string; checked_at: string }[];
  human_reviewed: boolean;
  disclaimer: string;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiError(0, "The service is not reachable right now.");
  }
  if (!response.ok) throw new ApiError(response.status, `Request failed (${response.status})`);
  return (await response.json()) as T;
}

export const api = {
  listSchemes: () => request<{ disclaimer: string; schemes: SchemeSummary[] }>("/schemes"),
  getScheme: (id: string) => request<SchemeDetail>(`/schemes/${encodeURIComponent(id)}`),
  checkEligibility: (profile: Profile) =>
    request<EligibilityResponse>("/eligibility/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    }),
};
