import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import App from "./App";

// Fake admin API (test data only).
type Role = "viewer" | "editor" | "reviewer" | "admin";
const ROW = (o: object) => ({ scheme_id: "draft-1", name: "Draft Scheme One", level: "central", state: null, status: "draft",
  prepared_by: "AI assistant (Claude)", submitted_by: null, reviewed_by: null, check_category: "Needs attention", exceptions: ["x"], ...o });
const RECORD = (status: string) => ({
  scheme_id: "draft-1", name: "Draft Scheme One", level: "central", state: null, issuing_body: "Test Ministry",
  verification: { status, prepared_by: "AI assistant (Claude)", submitted_by: status === "in_review" ? "ed" : undefined },
  sources: [{ id: "s1", title: "Official PDF", url: "https://example.gov.in/a.pdf", kind: "pdf", checked_at: "2026-11-21" }],
  rules: { groups: [{ key: "g", mode: "all", rules: [{ field: "age", operator: "gte", value: 70, message: "Aged 70+", source_id: "s1", page: 2 }] }] },
  benefits: [{ text: "Rs 5 lakh cover", source_id: "s1", page: 2, section: null }], required_documents: [], how_to_apply: [],
  evidence: [{ claim: "age", source_id: "s1", page: 2, quote: "aged 70 years and above" }],
});

function mockAdmin({ role = "reviewer" as Role, status = "in_review", independent = true, exceptions = 1, publishError = false } = {}) {
  const calls: { url: string; body?: unknown }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    const json = (d: object, s = 200) => new Response(JSON.stringify(d), { status: s });
    if (url === "/api/admin/login") {
      return body.password === "right-password-123"
        ? json({ token: "tok", user: { username: "rev", display_name: "Rev User", role } })
        : json({ detail: "Wrong username or password." }, 401);
    }
    if (url === "/api/admin/logout") return json({ ok: true });
    if (url === "/api/admin/schemes") return json({ schemes: [ROW({ status }), ROW({ scheme_id: "pub-1", name: "Published One", status: "reviewed", exceptions: [] })] });
    if (url === "/api/admin/schemes/draft-1") {
      return json({ record: RECORD(status), check_category: "Needs attention", independent_reviewer_ok: independent,
        issues: Array.from({ length: exceptions }, (_, i) => ({ category: "Needs attention", message: `exception ${i + 1}`, exception: true })) });
    }
    if (url === "/api/admin/schemes/draft-1/review") {
      return publishError
        ? json({ detail: { message: "Cannot publish yet.", blockers: ["Source domain example.gov.in is not approved."] } }, 409)
        : json({ status: body.decision === "publish" ? "reviewed" : "draft" });
    }
    if (url === "/api/admin/schemes/draft-1/submit") return json({ status: "in_review" });
    if (url === "/api/schemes") return json({ disclaimer: "d", schemes: [] });
    return json({}, 404);
  });
  return calls;
}

async function signIn(user: ReturnType<typeof userEvent.setup>, path = "/admin") {
  render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
  await user.type(await screen.findByLabelText("Username"), "rev");
  await user.type(screen.getByLabelText("Password"), "right-password-123");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("admin sign-in", () => {
  it("redirects to sign-in when not signed in", async () => {
    mockAdmin();
    render(<MemoryRouter initialEntries={["/admin"]}><App /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Admin sign in" })).toBeInTheDocument();
  });

  it("shows an error for a wrong password", async () => {
    mockAdmin();
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/admin/login"]}><App /></MemoryRouter>);
    await user.type(screen.getByLabelText("Username"), "rev");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong username or password.");
  });

  it("keeps the session out of browser storage", async () => {
    mockAdmin();
    const user = userEvent.setup();
    await signIn(user);
    await screen.findByRole("heading", { name: "Scheme review" });
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });
});

describe("admin dashboard", () => {
  it("lists drafts and published schemes with status counts", async () => {
    mockAdmin({ status: "draft" });
    const user = userEvent.setup();
    await signIn(user);
    expect(await screen.findByRole("link", { name: "Draft Scheme One" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Published One" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /Published/ }));
    expect(screen.queryByRole("link", { name: "Draft Scheme One" })).not.toBeInTheDocument();
  });
});

describe("review page", () => {
  it("independent reviewer must acknowledge exceptions, and sees blockers from the server", async () => {
    const calls = mockAdmin({ publishError: true });
    const user = userEvent.setup();
    await signIn(user, "/admin/schemes/draft-1");
    expect(await screen.findByRole("heading", { name: "Draft Scheme One" })).toBeInTheDocument();
    expect(screen.getByText("aged 70 years and above", { exact: false })).toBeInTheDocument(); // evidence shown
    await user.click(screen.getByRole("checkbox", { name: /checked the 1 open exception/ }));
    await user.click(screen.getByRole("button", { name: "Verify and publish" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Cannot publish yet.");
    expect(within(alert).getByText(/not approved/)).toBeInTheDocument();
    expect(calls.find((c) => c.url.endsWith("/review"))?.body).toEqual({ decision: "publish", comment: "", acknowledge_exceptions: true });
  });

  it("return to draft needs a comment", async () => {
    mockAdmin();
    const user = userEvent.setup();
    await signIn(user, "/admin/schemes/draft-1");
    const ret = await screen.findByRole("button", { name: "Return to draft" });
    expect(ret).toBeDisabled();
    await user.type(screen.getByLabelText("Comment"), "Add documents");
    expect(ret).toBeEnabled();
    await user.click(ret);
    expect(await screen.findByRole("status")).toHaveTextContent("Returned to draft.");
  });

  it("the submitter cannot review their own submission", async () => {
    mockAdmin({ independent: false });
    const user = userEvent.setup();
    await signIn(user, "/admin/schemes/draft-1");
    expect(await screen.findByText(/a different reviewer must verify it/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Verify and publish" })).not.toBeInTheDocument();
  });

  it("an editor can submit a draft but not publish", async () => {
    mockAdmin({ role: "editor", status: "draft" });
    const user = userEvent.setup();
    await signIn(user, "/admin/schemes/draft-1");
    await user.click(await screen.findByRole("button", { name: "Submit for review" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Submitted for review.");
    expect(screen.queryByRole("button", { name: "Verify and publish" })).not.toBeInTheDocument();
  });
});
