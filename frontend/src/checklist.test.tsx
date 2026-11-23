import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
import type { Answers } from "./answers";

// Fake scheme details (test data only).
const base = { level: "central", state: null, issuing_body: "Test Ministry", last_checked: "2026-11-21", apply_link: null,
  eligibility: [], benefits: [], historical_benefits: [], how_to_apply: [], notices: [], sources: [], human_reviewed: true, disclaimer: "d" };
const A = { ...base, scheme_id: "a", name: "Scheme A", required_documents: [
  { text: "Bank account details", source_id: "s", page: 1, section: "4. Benefit" },
  { text: "Birth certificate of the child", source_id: "s", page: 3, section: null },
] };
const B = { ...base, scheme_id: "b", name: "Scheme B", required_documents: [
  { text: "Bank Account Details.", source_id: "s", page: 2, section: null },  // same name, different case/punctuation
  { text: "Aadhaar card", source_id: "s", page: 2, section: null },
] };
const C = { ...base, scheme_id: "c", name: "Scheme C", required_documents: [] };
const RESULT = (id: string, name: string, result: string) =>
  ({ scheme_id: id, name, version: 1, result, missing_fields: [], manual_checks: [], groups: [] });

function mockApi() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    const json = (d: object, s = 200) => new Response(JSON.stringify(d), { status: s });
    const byId: Record<string, object> = { "/api/schemes/a": A, "/api/schemes/b": B, "/api/schemes/c": C };
    if (byId[url]) return json(byId[url]);
    if (url === "/api/schemes") return json({ disclaimer: "d", schemes: [A, B, C] });
    if (url === "/api/eligibility/check") return json({ disclaimer: "d", sample_data: false, results: [
      RESULT("a", "Scheme A", "eligible"), RESULT("b", "Scheme B", "need_more_info"), RESULT("c", "Scheme C", "not_eligible")] });
    return json({}, 404);
  });
}
// Answers and chosen schemes are held in app memory, so tests pass them to the app directly.
const at = (path: string, answers?: Partial<Answers>) =>
  render(<MemoryRouter initialEntries={[path]}><App initialAnswers={answers} /></MemoryRouter>);

describe("scheme details checklist", () => {
  it("C1: lists exactly the official documents, each with its source", async () => {
    mockApi();
    at("/schemes/a");
    const list = await screen.findByRole("region", { name: "Documents needed" });
    const boxes = within(list).getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    expect(within(list).getByRole("checkbox", { name: /Bank account details/ })).toBeInTheDocument();
    expect(within(list).getByRole("checkbox", { name: /Birth certificate of the child/ })).toBeInTheDocument();
    expect(within(list).getByText(/page 1, 4\. Benefit/)).toBeInTheDocument();
    expect(within(list).getByText(/page 3/)).toBeInTheDocument();
    expect(within(list).getByRole("status")).toHaveTextContent("0 of 2 documents ready");
  });

  it("C2: ticking 'I have this' updates progress and the still-needed list", async () => {
    mockApi();
    const user = userEvent.setup();
    at("/schemes/a");
    const list = await screen.findByRole("region", { name: "Documents needed" });
    await user.click(within(list).getByRole("checkbox", { name: /Bank account details/ }));
    expect(within(list).getByRole("status")).toHaveTextContent("1 of 2 documents ready");
    const summary = within(list).getByLabelText("Checklist summary");
    expect(summary).toHaveTextContent("Still needed (1)");
    expect(summary).toHaveTextContent("Birth certificate of the child");
    expect(summary).not.toHaveTextContent("Bank account details");
    await user.click(within(list).getByRole("checkbox", { name: /Birth certificate/ }));
    expect(within(list).getByLabelText("Checklist summary")).toHaveTextContent(/marked all listed documents as ready/);
    await user.click(within(list).getByRole("checkbox", { name: /Birth certificate/ })); // untick
    expect(within(list).getByRole("status")).toHaveTextContent("1 of 2 documents ready");
  });

  it("C4: ticks are never saved in the browser or sent to the server", async () => {
    const spy = mockApi();
    const user = userEvent.setup();
    at("/schemes/a");
    const list = await screen.findByRole("region", { name: "Documents needed" });
    const before = spy.mock.calls.length;
    for (const box of within(list).getAllByRole("checkbox")) await user.click(box);
    expect(spy.mock.calls.length).toBe(before); // no network requests caused by ticking
    expect(localStorage.length + sessionStorage.length).toBe(0);
    expect(document.cookie).toBe("");
  });

  it("shows 'not yet confirmed' when a scheme has no official document list", async () => {
    mockApi();
    at("/schemes/c");
    expect(await screen.findAllByText(/Not yet confirmed from an official source/)).not.toHaveLength(0);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});

describe("combined checklist", () => {
  it("merges only exactly-matching document names and notes which schemes need them", async () => {
    mockApi();
    at("/checklist", { checklistIds: ["a", "b", "c"] });
    const list = await screen.findByRole("region", { name: "Documents to prepare" });
    expect(within(list).getAllByRole("checkbox")).toHaveLength(3); // bank (merged), birth certificate, aadhaar
    const bank = within(list).getByRole("checkbox", { name: /Bank account details/ }).closest("li")!;
    expect(bank).toHaveTextContent("Needed for Scheme A");
    expect(bank).toHaveTextContent("Needed for Scheme B");
    const notes = screen.getAllByRole("note").map((n) => n.textContent ?? "");
    expect(notes.some((t) => t.includes("Scheme C — ask the scheme office."))).toBe(true);
  });

  it("asks people to check eligibility first when opened directly", async () => {
    mockApi();
    at("/checklist");
    expect(await screen.findByText("No schemes selected yet.")).toBeInTheDocument();
  });

  it("results page builds the checklist from likely-eligible and need-more-info schemes only", async () => {
    mockApi();
    const user = userEvent.setup();
    at("/results", { profile: { age: 40 } });
    await user.click(await screen.findByRole("button", { name: /Build my document checklist/ }));
    expect(await screen.findByText(/Documents for:/)).toHaveTextContent("Scheme A; Scheme B");
    expect(screen.getByText(/Documents for:/)).not.toHaveTextContent("Scheme C");
  });
});

describe("C3: no upload option anywhere", () => {
  it.each([["/schemes/a", undefined], ["/checklist", { checklistIds: ["a", "b"] }], ["/results", { profile: { age: 40 } }], ["/", undefined]])(
    "%s has no file input", async (path, state) => {
      mockApi();
      const { container } = at(path, state as Partial<Answers> | undefined);
      await screen.findAllByText(/Scheme A|Find Health Schemes/);
      expect(container.querySelector('input[type="file"]')).toBeNull();
      expect(screen.queryByText(/upload/i, { selector: "button, a, label" })).toBeNull();
    });
});

describe("print layout", () => {
  it("prints only the checklist (with the scheme name) and the disclaimer", async () => {
    mockApi();
    at("/schemes/a");
    const list = await screen.findByRole("region", { name: "Documents needed" });
    expect(list.className).not.toContain("print:hidden");
    const printHeading = within(list).getByText("Scheme A");
    expect(printHeading.className).toContain("hidden");      // not shown on screen
    expect(printHeading.className).toContain("print:block"); // shown on paper
    // Everything else on the page is hidden when printing.
    for (const heading of ["Who can apply", "Benefits", "How to apply", "Official sources"]) {
      const section = screen.queryByRole("heading", { name: heading })?.closest("section");
      if (section) expect(section.className).toContain("print:hidden");
    }
    expect(screen.getByRole("heading", { level: 1 }).closest("header")?.className).toContain("print:hidden");
  });

  it("the combined checklist includes the disclaimer", async () => {
    mockApi();
    at("/checklist", { checklistIds: ["a"] });
    await screen.findByRole("region", { name: "Documents to prepare" });
    expect(screen.getAllByRole("note").some((n) => /not an official government service/.test(n.textContent ?? ""))).toBe(true);
  });
});
