import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import App from "./App";

// Fake API (test data only).
const REPLY = {
  answer: "Ni-kshay Poshan Yojana [V1] may be relevant: Rs 1,000 per month. Maternity scheme [U1] (unverified - confirm on the official website).",
  mode: "ai", disclaimer: "Always confirm on the official website.", redacted: false,
  sources: [
    { label: "V1", id: "nikshay-poshan-yojana", name: "Ni-kshay Poshan Yojana", verified: true, link: "/schemes/nikshay-poshan-yojana", summary: "Rs 1,000 per month" },
    { label: "U1", id: "u-1", name: "Maternity Benefit", verified: false, link: "/catalogue/u-1", summary: "Rs 50,000 per delivery",
      level: "state", state: "Karnataka",
      details: [{ title: "Benefits", items: ["Rs 50,000 per delivery"] }, { title: "Who can apply", items: ["Registered woman worker"] }] },
  ],
};
const ENTRY = { id: "u-1", name: "Maternity Benefit", level: "state", state: "Karnataka", category: "Health", brief_description: "Support",
  reviewed_scheme_id: null, verified: false, tags: [], ministry: "Labour Department", implementing_agency: "", target_beneficiaries: "",
  detailed_description: "Help for **women** workers.", eligibility_text: "Registered worker", documents_text: "Birth certificate",
  benefits_text: "Rs 50,000", application_text: "Apply online", official_website: "https://example.karnataka.gov.in/", application_form: "",
  corrupted_text: true, warning: "Unverified information: not checked." };

function mockApi(chatReply: object | number = REPLY) {
  const calls: { url: string; body?: unknown }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const json = (d: object, s = 200) => new Response(JSON.stringify(d), { status: s });
    if (url === "/api/chat") return typeof chatReply === "number" ? json({ detail: "x" }, chatReply) : json(chatReply);
    if (url === "/api/schemes") return json({ disclaimer: "d", schemes: [] });
    if (url === "/api/catalogue/facets") return json({ states: ["Karnataka"], categories: ["Health"], count: 387, central: 348 });
    if (url.startsWith("/api/catalogue?")) return json({ warning: "Unverified information: not checked.", total: 1, page: 1, page_size: 20, results: [ENTRY] });
    if (url === "/api/catalogue/u-1") return json(ENTRY);
    return json({}, 404);
  });
  return calls;
}
const at = (path: string) => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);

describe("chat assistant", () => {
  it("suggests schemes with benefits, marking verified and unverified sources", async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    at("/");
    await user.click(screen.getByRole("button", { name: /Ask SchemeSathi/ }));
    const dialog = screen.getByRole("dialog", { name: "SchemeSathi assistant" });
    expect(within(dialog).getByText(/don't share Aadhaar/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Your question"), "help for TB patients");
    await user.click(within(dialog).getByRole("button", { name: "Send" }));
    const list = await within(dialog).findByRole("list", { name: "Suggested schemes" });
    const [v1, u1] = within(list).getAllByRole("listitem");
    expect(v1).toHaveTextContent("Verified");
    expect(v1).toHaveTextContent("Rs 1,000 per month");
    expect(within(v1).getByRole("link", { name: "Ni-kshay Poshan Yojana" })).toHaveAttribute("href", "/schemes/nikshay-poshan-yojana");
    expect(u1).toHaveTextContent("Unverified");
    expect(within(u1).getByRole("link", { name: "Maternity Benefit" })).toHaveAttribute("href", "/catalogue/u-1");
    expect(within(dialog).getByText("Always confirm on the official website.")).toBeInTheDocument();
    expect(calls.find((c) => c.url === "/api/chat")?.body).toEqual({ message: "help for TB patients", history: [], context_ids: [], lang: "en" });
  });

  it("sends the earlier conversation as history for follow-up questions", async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    at("/");
    await user.click(screen.getByRole("button", { name: /Ask SchemeSathi/ }));
    const input = screen.getByLabelText("Your question");
    await user.type(input, "first question{Enter}");
    await screen.findByRole("list", { name: "Suggested schemes" });
    await user.type(input, "and the documents?{Enter}");
    await screen.findAllByRole("list", { name: "Suggested schemes" });
    const second = calls.filter((c) => c.url === "/api/chat")[1].body as { history: { role: string }[]; context_ids: string[] };
    expect(second.history.map((h) => h.role)).toEqual(["user", "assistant"]);
    expect(second.context_ids).toEqual(["nikshay-poshan-yojana", "u-1"]); // follow-ups refer to the schemes just shown
  });

  it("shows database answers with sections, follow-up buttons and the privacy notice", async () => {
    const calls = mockApi({ ...REPLY, mode: "database", answer: "Here are schemes that may be relevant:", redacted: true });
    const user = userEvent.setup();
    at("/");
    await user.click(screen.getByRole("button", { name: /Ask SchemeSathi/ }));
    await user.click(screen.getByRole("button", { name: /pregnant and live in Karnataka/ })); // example question
    const list = await screen.findByRole("list", { name: "Suggested schemes" });
    const u1 = within(list).getAllByRole("listitem").find((li) => li.textContent?.includes("Maternity Benefit"))!;
    expect(u1).toHaveTextContent("Who can apply");
    expect(u1).toHaveTextContent("Registered woman worker");
    expect(u1).toHaveTextContent("Karnataka");
    expect(screen.getByText(/removed a number or email/)).toBeInTheDocument();
    await user.click(within(screen.getByLabelText("Follow-up questions")).getByRole("button", { name: "What documents are needed?" }));
    await screen.findAllByRole("list", { name: "Suggested schemes" });
    const follow = calls.filter((c) => c.url === "/api/chat")[1].body as { message: string; context_ids: string[] };
    expect(follow).toMatchObject({ message: "What documents are needed?", context_ids: ["nikshay-poshan-yojana", "u-1"] });
  });

  it("explains rate limiting and keeps nothing in browser storage", async () => {
    mockApi(429);
    const user = userEvent.setup();
    at("/");
    await user.click(screen.getByRole("button", { name: /Ask SchemeSathi/ }));
    await user.type(screen.getByLabelText("Your question"), "hello{Enter}");
    expect(await screen.findByText(/asked a lot of questions/)).toBeInTheDocument();
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });
});

describe("all schemes (unverified catalogue)", () => {
  it("lists schemes with an Unverified badge and warning", async () => {
    mockApi();
    at("/catalogue");
    expect(await screen.findByRole("heading", { name: "Maternity Benefit" })).toBeInTheDocument();
    expect(screen.getAllByText("Unverified").length).toBeGreaterThan(0);
    expect(screen.getByRole("note", { name: "Unverified information" })).toHaveTextContent("not checked");
    expect(screen.getByRole("tab", { name: "Karnataka" })).toBeInTheDocument();
    expect(screen.getByText(/387 central and Karnataka schemes/)).toBeInTheDocument();
  });

  it("entry page shows the warning, cleaned text and the website as unverified", async () => {
    mockApi();
    at("/catalogue/u-1");
    expect(await screen.findByRole("heading", { name: "Maternity Benefit" })).toBeInTheDocument();
    expect(screen.getByRole("note", { name: "Unverified information" })).toBeInTheDocument();
    expect(screen.getByText("Help for women workers.")).toBeInTheDocument(); // markdown markers removed
    expect(screen.getByText(/damaged in the source data/)).toBeInTheDocument();
    const site = screen.getByRole("link", { name: /example\.karnataka\.gov\.in/ });
    expect(site).toHaveAttribute("rel", expect.stringContaining("nofollow"));
    expect(screen.getByText(/Not verified\. Check that it is an official government website/)).toBeInTheDocument();
  });
});
