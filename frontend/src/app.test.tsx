import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
import { toProfile } from "./pages/Questionnaire";

// Fake API responses (test data only).
const SCHEME = {
  scheme_id: "test-scheme", name: "Test Health Scheme", level: "central", state: null,
  issuing_body: "Test Ministry", last_checked: "2026-11-21", apply_link: null,
};
const KA_SCHEME = {
  scheme_id: "ka-scheme", name: "Karnataka Test Scheme", level: "state", state: "Karnataka",
  issuing_body: "Karnataka Test Board", last_checked: "2026-11-21", apply_link: "https://apply.example.gov.in/",
};
const DETAIL = {
  ...SCHEME,
  eligibility: [{ text: "Person with TB", source_id: "s1", page: 1, section: "2. Beneficiary" }],
  benefits: [{ text: "Rs 1,000 per month", source_id: "s1", page: 39, section: null }],
  historical_benefits: [{ text: "Rs 500 per month (earlier)", source_id: "s1", page: 1, section: null }],
  required_documents: [], how_to_apply: [],
  notices: ["Effective date not confirmed"],
  sources: [{ id: "s1", title: "Official guideline", url: "https://example.gov.in/doc.pdf", checked_at: "2026-11-21" }],
  human_reviewed: true, disclaimer: "This is not an official government service.",
};
function result(overrides: object) {
  return { scheme_id: "test-scheme", name: "Test Health Scheme", version: 1, result: "need_more_info",
    missing_fields: [], manual_checks: [], groups: [], ...overrides };
}

function mockApi(eligibility: (body: Record<string, unknown>) => object | object[], schemes: object[] = [SCHEME]) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const json = (data: object, status = 200) => new Response(JSON.stringify(data), { status });
    if (url === "/api/schemes") return json({ disclaimer: "d", schemes });
    if (url === "/api/schemes/test-scheme") return json(DETAIL);
    if (url.startsWith("/api/schemes/")) return json({ detail: "Scheme not found" }, 404);
    if (url === "/api/eligibility/check") {
      const body = JSON.parse(String(init?.body));
      const out = eligibility(body);
      return json({ disclaimer: "This is not an official government service.", sample_data: false, results: Array.isArray(out) ? out : [out] });
    }
    return json({}, 404);
  });
}

function renderAt(path: string, state?: object) {
  return render(
    <MemoryRouter initialEntries={[state ? { pathname: path, state } : path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("questionnaire answers", () => {
  it("leaves unanswered questions out instead of sending 0 or 'no'", () => {
    const empty = { age: "", gender: "", has_disability: "", state: "", area_type: "", annual_family_income: "", social_category: "", occupation: "" };
    expect(toProfile(empty)).toEqual({});
    expect(toProfile({ ...empty, age: "30", has_disability: "no", annual_family_income: "0" }))
      .toEqual({ age: 30, has_disability: false, annual_family_income: 0 });
  });
});

describe("home page", () => {
  it("lists reviewed schemes from the API and shows the disclaimer", async () => {
    mockApi(() => result({}));
    renderAt("/");
    expect(await screen.findByText("Test Health Scheme")).toBeInTheDocument();
    expect(screen.getByText(/not an official government service/i)).toBeInTheDocument();
    expect(screen.queryByText(/sponsored/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ad space/i)).not.toBeInTheDocument();
  });

  it("shows a friendly error when the backend is down", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("network"));
    renderAt("/");
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't load/i);
  });
});

describe("questionnaire to results journey", () => {
  it("submits only answered fields and shows results", async () => {
    const spy = mockApi(() => result({ result: "not_eligible",
      groups: [{ key: "g", mode: "all", outcome: "fail", rules: [{ field: "has_tb_diagnosis", operator: "is_true", outcome: "fail", message: "Person with TB", source_id: "s1", page: 1, section: null }] }] }));
    const user = userEvent.setup();
    renderAt("/questionnaire");
    await user.type(screen.getByPlaceholderText("Enter your age"), "45");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.selectOptions(screen.getByLabelText("State / UT"), "Karnataka");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "See Results" }));
    expect(await screen.findByText("Not eligible")).toBeInTheDocument();
    const call = spy.mock.calls.find(([url]) => String(url) === "/api/eligibility/check")!;
    expect(JSON.parse(String(call[1]!.body))).toEqual({ age: 45, state: "Karnataka" });
  });

  it("blocks an invalid age", async () => {
    mockApi(() => result({}));
    const user = userEvent.setup();
    renderAt("/questionnaire");
    await user.type(screen.getByPlaceholderText("Enter your age"), "200");
    expect(screen.getByRole("alert")).toHaveTextContent(/0 to 120/);
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });
});

describe("results page", () => {
  it("asks a sensitive follow-up only when a scheme needs it, then re-checks", async () => {
    const spy = mockApi((body) =>
      body.has_tb_diagnosis === undefined
        ? result({ missing_fields: ["has_tb_diagnosis"] })
        : result({ manual_checks: ["Must be registered on the NIKSHAY portal"] }));
    const user = userEvent.setup();
    renderAt("/results", { profile: { age: 40 } });
    expect(await screen.findByText(/diagnosed you with tuberculosis/i)).toBeInTheDocument();
    expect(screen.getByText(/never stored/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Yes" }));
    expect(await screen.findByText("Must be registered on the NIKSHAY portal")).toBeInTheDocument();
    expect(screen.queryByText(/diagnosed you with tuberculosis/i)).not.toBeInTheDocument();
    const bodies = spy.mock.calls.filter(([u]) => String(u) === "/api/eligibility/check").map(([, i]) => JSON.parse(String(i!.body)));
    expect(bodies.at(-1)).toEqual({ age: 40, has_tb_diagnosis: true });
  });

  it("does not ask health questions when no scheme needs them", async () => {
    mockApi(() => result({ result: "eligible" }));
    renderAt("/results", { profile: { age: 40 } });
    expect(await screen.findByText("Likely eligible")).toBeInTheDocument();
    expect(screen.queryByText(/tuberculosis/i)).not.toBeInTheDocument();
  });

  it("sends people with no answers back to the questionnaire", async () => {
    mockApi(() => result({}));
    renderAt("/results");
    expect(await screen.findByText("Tell us about yourself")).toBeInTheDocument();
  });
});

describe("central / Karnataka filter", () => {
  it("filters the home scheme list and works together with search", async () => {
    mockApi(() => result({}), [SCHEME, KA_SCHEME]);
    const user = userEvent.setup();
    renderAt("/");
    expect(await screen.findByText("Test Health Scheme")).toBeInTheDocument();
    expect(screen.getByText("Karnataka Test Scheme")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Central" }));
    expect(screen.getByRole("tab", { name: "Central" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Test Health Scheme")).toBeInTheDocument();
    expect(screen.queryByText("Karnataka Test Scheme")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Karnataka State" }));
    expect(screen.getByText("Karnataka Test Scheme")).toBeInTheDocument();
    expect(screen.queryByText("Test Health Scheme")).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Search schemes..."), "Health");  // matches only the central scheme
    expect(screen.getByText("No schemes found.")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "All" }));
    expect(screen.getByText("Test Health Scheme")).toBeInTheDocument();
    expect(screen.queryByText("Karnataka Test Scheme")).not.toBeInTheDocument();
  });

  it("filters eligibility results without changing them", async () => {
    mockApi(() => [result({ result: "eligible" }), result({ scheme_id: "ka-scheme", name: "Karnataka Test Scheme", result: "not_eligible" })],
      [SCHEME, KA_SCHEME]);
    const user = userEvent.setup();
    renderAt("/results", { profile: { age: 40 } });
    expect(await screen.findByRole("article", { name: "Karnataka Test Scheme" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Test Health Scheme" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Karnataka State" }));
    expect(screen.queryByRole("article", { name: "Test Health Scheme" })).not.toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Karnataka Test Scheme" })).toHaveTextContent("Not eligible");

    await user.click(screen.getByRole("tab", { name: "Central" }));
    expect(screen.getByRole("article", { name: "Test Health Scheme" })).toHaveTextContent("Likely eligible");
    expect(screen.queryByRole("article", { name: "Karnataka Test Scheme" })).not.toBeInTheDocument();
  });

  it("shows a message when a category has no schemes", async () => {
    mockApi(() => result({ result: "eligible" }), [SCHEME]);
    const user = userEvent.setup();
    renderAt("/results", { profile: { age: 40 } });
    await screen.findByText("Likely eligible");
    await user.click(screen.getByRole("tab", { name: "Karnataka State" }));
    expect(screen.getByRole("status")).toHaveTextContent(/no reviewed schemes in this category/i);
  });
});

describe("official apply link", () => {
  it("links to the verified official URL in a new tab, or says the link is not available", async () => {
    mockApi(() => [result({ result: "eligible" }), result({ scheme_id: "ka-scheme", name: "Karnataka Test Scheme", result: "eligible" })],
      [SCHEME, KA_SCHEME]);
    renderAt("/results", { profile: { age: 40 } });
    const ka = await screen.findByRole("article", { name: "Karnataka Test Scheme" });
    const link = within(ka).getByRole("link", { name: /Apply on Official Website/ });
    expect(link).toHaveAttribute("href", "https://apply.example.gov.in/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    const central = screen.getByRole("article", { name: "Test Health Scheme" });
    expect(within(central).getByText("Link not available")).toBeInTheDocument();
    expect(within(central).queryByRole("link", { name: /Apply on Official Website/ })).not.toBeInTheDocument();
  });

  it("appears on home scheme cards", async () => {
    mockApi(() => result({}), [SCHEME, KA_SCHEME]);
    renderAt("/");
    const ka = await screen.findByRole("article", { name: "Karnataka Test Scheme" });
    expect(within(ka).getByRole("link", { name: /Apply on Official Website/ })).toHaveAttribute("href", "https://apply.example.gov.in/");
    expect(within(screen.getByRole("article", { name: "Test Health Scheme" })).getByText("Link not available")).toBeInTheDocument();
  });

  it("is never made up when the API has no link", async () => {
    mockApi(() => result({}));
    renderAt("/schemes/test-scheme");
    await screen.findByRole("heading", { name: "Test Health Scheme" });
    expect(screen.getByText("Link not available")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Apply on Official Website/ })).not.toBeInTheDocument();
  });
});

describe("scheme details", () => {
  it("shows benefits, earlier amounts, notices and official sources with citations", async () => {
    mockApi(() => result({}));
    renderAt("/schemes/test-scheme");
    expect(await screen.findByRole("heading", { name: "Test Health Scheme" })).toBeInTheDocument();
    expect(screen.getByText("Rs 1,000 per month")).toBeInTheDocument();
    expect(screen.getByText(/Rs 500 per month/)).toBeInTheDocument();
    expect(screen.getByText("Effective date not confirmed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Official guideline/ })).toHaveAttribute("href", "https://example.gov.in/doc.pdf");
    expect(screen.getByText(/page 39/)).toBeInTheDocument();
    expect(screen.getAllByText(/Not yet confirmed from an official source/).length).toBe(2);
  });

  it("says a draft or unknown scheme is not available", async () => {
    mockApi(() => result({}));
    renderAt("/schemes/ab-pmjay");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/not available.*not have been reviewed/i));
  });
});
