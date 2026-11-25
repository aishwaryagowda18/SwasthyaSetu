import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
import { KN } from "./kn";
import { spokenText } from "./components/ChatAssistant";

// ----- Kannada coverage: every interface text marked with t("...") or tx("...") has a Kannada translation -----

// Source text of the citizen-facing files (admin pages are staff-only and stay in English).
const SOURCES = import.meta.glob(["./pages/*.tsx", "./components/*.tsx", "./options.ts"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
function marked(): string[] {
  const found = new Set<string>();
  for (const text of Object.values(SOURCES)) {
    for (const m of text.matchAll(/\b(?:t|tx)\(\s*"((?:[^"\\]|\\.)*)"/g)) found.add(m[1].replace(/\\"/g, '"'));
  }
  return [...found];
}

describe("Kannada translations", () => {
  it("cover every marked interface text", () => {
    const texts = marked();
    expect(texts.length).toBeGreaterThan(200);
    expect(texts.filter((s) => !(s in KN))).toEqual([]);
  });

  it("keep placeholders like {n} and {date}", () => {
    for (const [en, kn] of Object.entries(KN)) {
      const need = (en.match(/\{\w+\}/g) ?? []).sort();
      expect((kn.match(/\{\w+\}/g) ?? []).sort(), en).toEqual(need);
    }
  });
});

// ----- Fake API (test data only) -----

const SCHEME = { scheme_id: "nikshay-poshan-yojana", name: "Ni-kshay Poshan Yojana", level: "central", state: null,
  issuing_body: "Central TB Division", last_checked: "2026-11-21", apply_link: null };
const REPLY = {
  answer: "ನಿಮಗೆ ಉಪಯುಕ್ತವಾಗಬಹುದಾದ ಯೋಜನೆಗಳು ಇಲ್ಲಿದೆ:", mode: "database", disclaimer: "d", redacted: false,
  sources: [{ label: "V1", id: "nikshay-poshan-yojana", name: "Ni-kshay Poshan Yojana", verified: true,
    link: "/schemes/nikshay-poshan-yojana", summary: "Rs 1,000", level: "central", state: "",
    details: [{ title: "ಪ್ರಯೋಜನಗಳು", items: ["Rs 1,000 per month"] }] }],
};

function mockApi() {
  const calls: { url: string; body?: Record<string, unknown> }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const json = (d: object) => new Response(JSON.stringify(d), { status: 200 });
    if (url === "/api/schemes") return json({ disclaimer: "d", schemes: [SCHEME] });
    if (url === "/api/chat") return json(REPLY);
    return new Response("{}", { status: 404 });
  });
  return calls;
}
const at = (path: string) => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  delete (window as unknown as Record<string, unknown>).speechSynthesis;
});

describe("language switch", () => {
  it("switches the interface to Kannada and back, keeping nothing in browser storage", async () => {
    mockApi();
    const user = userEvent.setup();
    at("/");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Find Health Schemes You May Be Eligible For");
    await user.click(screen.getByRole("button", { name: "Change language to Kannada" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("ನೀವು ಅರ್ಹರಾಗಬಹುದಾದ ಆರೋಗ್ಯ ಯೋಜನೆಗಳನ್ನು ಹುಡುಕಿ");
    expect(screen.getByRole("navigation", { name: "Main" })).toHaveTextContent("ಪರಿಶೀಲಿಸಿದ ಯೋಜನೆಗಳು");
    expect(document.documentElement.lang).toBe("kn");
    // Scheme names (official content) stay as written.
    expect(await screen.findByRole("heading", { name: "Ni-kshay Poshan Yojana" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /ಇಂಗ್ಲಿಷ್‌ಗೆ ಬದಲಿಸಿ/ }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Find Health Schemes");
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });

  it("asks the chatbot for Kannada replies when Kannada is chosen", async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    at("/");
    await user.click(screen.getByRole("button", { name: "Change language to Kannada" }));
    await user.click(screen.getByRole("button", { name: /SchemeSathi ಯನ್ನು ಕೇಳಿ/ }));
    await user.click(screen.getByRole("button", { name: /ನಾನು ಗರ್ಭಿಣಿ/ })); // Kannada example question
    expect(await screen.findByText("ಪ್ರಯೋಜನಗಳು")).toBeInTheDocument();
    const body = calls.find((c) => c.url === "/api/chat")?.body;
    expect(body).toMatchObject({ lang: "kn" });
    expect(String(body?.message)).toContain("ಗರ್ಭಿಣಿ");
  });
});

describe("last checked dates", () => {
  it("are shown on reviewed scheme cards", async () => {
    mockApi();
    at("/");
    const card = await screen.findByRole("article", { name: "Ni-kshay Poshan Yojana" });
    expect(card).toHaveTextContent(/Sources last checked: 21 Nov 2026/);
  });
});

// ----- Voice -----

class FakeRecognition {
  static last: FakeRecognition | null = null;
  lang = ""; interimResults = false; continuous = false;
  onresult: ((e: unknown) => void) | null = null; onend: (() => void) | null = null; onerror: ((e: unknown) => void) | null = null;
  started = false;
  constructor() { FakeRecognition.last = this; }
  start() { this.started = true; }
  stop() { this.onend?.(); }
  say(text: string) {
    const result = Object.assign([{ transcript: text }], { isFinal: true });
    this.onresult?.({ results: [result] });
    this.onend?.();
  }
}

describe("voice", () => {
  it("hides the microphone when the browser has no speech recognition", async () => {
    mockApi();
    const user = userEvent.setup();
    at("/");
    await user.click(screen.getByRole("button", { name: /Ask SchemeSathi/ }));
    expect(screen.queryByRole("button", { name: "Ask by voice" })).not.toBeInTheDocument();
  });

  it("turns speech into a question in the chosen language, with a privacy notice", async () => {
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRecognition;
    const calls = mockApi();
    const user = userEvent.setup();
    at("/");
    await user.click(screen.getByRole("button", { name: /Ask SchemeSathi/ }));
    await user.click(screen.getByRole("button", { name: "Ask by voice" }));
    const rec = FakeRecognition.last!;
    expect(rec.started).toBe(true);
    expect(rec.lang).toBe("en-IN");
    expect(screen.getByText(/may send the audio to Google or Microsoft/)).toBeInTheDocument();
    act(() => rec.say("help for TB patients"));
    await screen.findByRole("list", { name: "Suggested schemes" });
    expect(calls.find((c) => c.url === "/api/chat")?.body).toMatchObject({ message: "help for TB patients" });
  });

  it("reads answers aloud, and explains when no Kannada voice is installed", async () => {
    const spoken: { text: string; lang: string }[] = [];
    let voices = [{ lang: "en-IN", name: "English (India)" }];
    (window as unknown as Record<string, unknown>).speechSynthesis = {
      cancel: () => {}, getVoices: () => voices,
      speak: (u: { text: string; lang: string; onend?: () => void }) => { spoken.push({ text: u.text, lang: u.lang }); u.onend?.(); },
    };
    vi.stubGlobal("SpeechSynthesisUtterance", class { text: string; lang = ""; voice: unknown = null; onend = null; onerror = null; constructor(t: string) { this.text = t; } });
    mockApi();
    const user = userEvent.setup();
    at("/");
    await user.click(screen.getByRole("button", { name: /Ask SchemeSathi/ }));
    await user.type(screen.getByLabelText("Your question"), "tb{Enter}");
    await user.click(await screen.findByRole("button", { name: /Read aloud/ }));
    expect(spoken[0].lang).toBe("en-IN");
    expect(spoken[0].text).toContain("Ni-kshay Poshan Yojana");

    // Kannada chosen, but the device has no Kannada voice: say so instead of reading badly.
    await user.click(screen.getByRole("button", { name: "Close assistant" }));
    await user.click(screen.getByRole("button", { name: "Change language to Kannada" }));
    await user.click(screen.getByRole("button", { name: /SchemeSathi ಯನ್ನು ಕೇಳಿ/ }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getAllByRole("button", { name: /ಓದಿ ಹೇಳು/ })[0]);
    expect(within(dialog).getByText(/ಕನ್ನಡ ಧ್ವನಿ ಸ್ಥಾಪಿಸಿಲ್ಲ/)).toBeInTheDocument();
    expect(spoken).toHaveLength(1);

    voices = [...voices, { lang: "kn-IN", name: "Kannada" }];
    await user.click(within(dialog).getAllByRole("button", { name: /ಓದಿ ಹೇಳು/ })[0]);
    expect(spoken[1].lang).toBe("kn-IN");
    vi.unstubAllGlobals();
  });

  it("spoken text includes the answer, schemes and their sections", () => {
    const text = spokenText(REPLY as never);
    expect(text).toContain("ನಿಮಗೆ ಉಪಯುಕ್ತವಾಗಬಹುದಾದ");
    expect(text).toContain("Ni-kshay Poshan Yojana.");
    expect(text).toContain("ಪ್ರಯೋಜನಗಳು: Rs 1,000 per month.");
  });
});
