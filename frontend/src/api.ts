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
  constructor(public status: number, message: string, public blockers: string[] = []) {
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
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    let blockers: string[] = [];
    try {
      const body = await response.json();
      const detail = body?.detail;
      if (typeof detail === "string") message = detail;
      else if (detail?.message) { message = detail.message; blockers = detail.blockers ?? []; }
    } catch { /* not JSON */ }
    throw new ApiError(response.status, message, blockers);
  }
  return (await response.json()) as T;
}

// ----- Unverified catalogue -----

export interface CatalogueSummary {
  id: string; name: string; level: "central" | "state"; state: string | null; category: string;
  brief_description: string; reviewed_scheme_id: string | null; verified: false;
}
export interface CatalogueEntry extends CatalogueSummary {
  tags: string[]; ministry: string; implementing_agency: string; target_beneficiaries: string;
  detailed_description: string; eligibility_text: string; documents_text: string; benefits_text: string;
  application_text: string; official_website: string; application_form: string; corrupted_text: boolean; warning: string;
}
export interface CataloguePage { warning: string; total: number; page: number; page_size: number; results: CatalogueSummary[] }
export interface CatalogueFacets { states: string[]; categories: string[]; count: number; central: number }

// ----- Chatbot -----

export interface ChatTurn { role: "user" | "assistant"; content: string }
export interface ChatSource {
  label: string; id: string; name: string; verified: boolean; link: string; summary: string;
  level?: string; state?: string; details?: ChatSection[];
}
export interface ChatSection { title: string; items: string[] }
export interface ChatReply { answer: string; mode: "ai" | "database"; sources: ChatSource[]; disclaimer: string; redacted: boolean }

export const catalogueApi = {
  search: (params: { q?: string; level?: string; state?: string; category?: string; page?: number }) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== "") qs.set(k, String(v)); });
    return request<CataloguePage>(`/catalogue?${qs.toString()}`);
  },
  facets: () => request<CatalogueFacets>("/catalogue/facets"),
  entry: (id: string) => request<CatalogueEntry>(`/catalogue/${encodeURIComponent(id)}`),
};

export const chatApi = {
  /** contextIds: scheme ids from the previous reply, so follow-ups like "how do I apply?" refer to them. */
  ask: (message: string, history: ChatTurn[], contextIds: string[] = [], lang: "en" | "kn" = "en") =>
    request<ChatReply>("/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history, context_ids: contextIds, lang }),
    }),
};

// ----- Admin -----

export interface AdminUser { username: string; display_name: string; role: "viewer" | "editor" | "reviewer" | "admin" }
export type ReviewStatus = "draft" | "in_review" | "reviewed";
export interface AdminSchemeRow {
  scheme_id: string; name: string; level: string; state: string | null; status: ReviewStatus;
  prepared_by: string | null; submitted_by: string | null; reviewed_by: string | null;
  check_category: string; exceptions: string[];
}
export interface AdminIssue { category: string; message: string; exception: boolean }
// The full scheme record is shown read-only; only fields used by the page are typed.
export interface AdminRecord {
  scheme_id: string; name: string; level: string; state: string | null; issuing_body: string;
  verification: { status: ReviewStatus; prepared_by?: string; submitted_by?: string; reviewed_by?: string;
    reviewed_at?: string; review_comment?: string; history?: { action: string; by: string; at: string; comment: string }[] };
  sources: { id: string; title: string; url: string; kind: string; checked_at: string; notes?: string }[];
  rules: { groups: { key: string; mode: string; rules: { field?: string; operator: string; value?: unknown; message: string; source_id: string; page?: number; section?: string }[] }[] };
  benefits: CitedItem[]; required_documents: ({ name: string } & Omit<CitedItem, "text">)[]; how_to_apply: CitedItem[];
  evidence: { claim: string; source_id: string; page?: number; section?: string; quote: string }[];
  flags?: { type: string; detail: string }[];
  apply_link?: { url: string; source_id: string };
}
export interface AdminDetail { record: AdminRecord; check_category: string; issues: AdminIssue[]; independent_reviewer_ok: boolean }
export interface SourceDomain { domain: string; issuing_body: string; status: string; approved_by: string | null; approved_at: string | null }
export interface AuditEntry { at: string; user: string; role: string; action: string; target: string; comment: string }

function authed(token: string, method = "GET", body?: object): RequestInit {
  return {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  };
}

export const adminApi = {
  login: (username: string, password: string) =>
    request<{ token: string; user: AdminUser }>("/admin/login", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }),
    }),
  logout: (token: string) => request<{ ok: boolean }>("/admin/logout", authed(token, "POST")),
  schemes: (token: string) => request<{ schemes: AdminSchemeRow[] }>("/admin/schemes", authed(token)),
  scheme: (token: string, id: string) => request<AdminDetail>(`/admin/schemes/${encodeURIComponent(id)}`, authed(token)),
  submit: (token: string, id: string, comment: string) =>
    request<{ status: ReviewStatus }>(`/admin/schemes/${encodeURIComponent(id)}/submit`, authed(token, "POST", { comment })),
  review: (token: string, id: string, decision: "publish" | "return", comment: string, acknowledge_exceptions: boolean) =>
    request<{ status: ReviewStatus }>(`/admin/schemes/${encodeURIComponent(id)}/review`, authed(token, "POST", { decision, comment, acknowledge_exceptions })),
  unpublish: (token: string, id: string, comment: string) =>
    request<{ status: ReviewStatus }>(`/admin/schemes/${encodeURIComponent(id)}/unpublish`, authed(token, "POST", { comment })),
  sources: (token: string) => request<{ domains: SourceDomain[] }>("/admin/sources", authed(token)),
  approveSource: (token: string, domain: string) =>
    request<{ status: string }>(`/admin/sources/${encodeURIComponent(domain)}/approve`, authed(token, "POST")),
  audit: (token: string) => request<{ entries: AuditEntry[] }>("/admin/audit", authed(token)),
};

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
