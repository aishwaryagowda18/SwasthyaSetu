import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, Loader2, MessageCircle, Mic, MicOff, Send, ShieldCheck, Square, Volume2, X } from "lucide-react";
import { ApiError, chatApi, type ChatReply, type ChatSource, type ChatTurn } from "../api";
import { tx, useT, type Lang } from "../i18n";

interface Message { role: "user" | "assistant"; text: string; reply?: ChatReply; error?: boolean }

const EXAMPLES = [
  tx("I am pregnant and live in Karnataka. Which schemes can help me?"),
  tx("What support is there for TB patients?"),
  tx("Pension schemes for old age"),
];
// Quick follow-up questions shown under a reply with schemes.
const FOLLOW_UPS = [tx("What documents are needed?"), tx("How do I apply?"), tx("Who can apply?"), tx("What are the benefits?")];

/** Render the answer as plain text, removing markdown bold markers. */
const tidy = (t: string) => t.replace(/\*\*/g, "");

// ----- Voice (browser speech features; nothing is stored by SchemeSathi) -----

interface Recognition {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
  start: () => void; stop: () => void;
}
type RecognitionCtor = new () => Recognition;

function speechRecognition(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
const speechLang = (lang: Lang) => (lang === "kn" ? "kn-IN" : "en-IN");

/** Text read aloud for a reply: the answer, then each scheme with its sections. */
export function spokenText(reply: ChatReply): string {
  const parts = [tidy(reply.answer)];
  for (const s of reply.sources) {
    parts.push(s.name + ".");
    for (const sec of s.details ?? []) parts.push(`${sec.title}: ${sec.items.slice(0, 4).join(". ")}.`);
  }
  return parts.join("\n");
}

function SchemeCard({ s, onOpen }: { s: ChatSource; onOpen: () => void }) {
  const { t } = useT();
  const where = s.level === "central" ? t("Central") : s.state ? t(s.state) : s.level === "state" ? t("State") : "";
  return (
    <li className="rounded-lg border border-border p-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {s.verified
          ? <span className="badge badge-eligible"><ShieldCheck className="h-3 w-3 mr-1" aria-hidden="true" />{t("Verified")}</span>
          : <span className="badge badge-info">{t("Unverified")}</span>}
        {where && <span className="badge">{where}</span>}
      </div>
      <Link to={s.link} onClick={onOpen} className="mt-1 block font-semibold text-blue hover:underline">{s.name}</Link>
      {s.details && s.details.length > 0 ? (
        <div className="mt-1.5 space-y-1.5">
          {s.details.map((sec) => (
            <div key={sec.title}>
              <p className="text-xs font-bold text-navy">{sec.title}</p>
              <ul className="list-disc pl-4 text-xs text-foreground space-y-0.5">
                {sec.items.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        s.summary && <p className="mt-1 text-xs text-muted-foreground">{s.summary}</p>
      )}
      <Link to={s.link} onClick={onOpen} className="mt-1.5 inline-block text-xs font-semibold text-blue hover:underline">
        {t("View full details")}
      </Link>
    </li>
  );
}

/**
 * Floating scheme assistant. Answers come from SchemeSathi's scheme database (no API needed).
 * Conversation is kept in memory only: never stored in the browser or on the server,
 * and cleared when the page is closed or reloaded.
 */
export default function ChatAssistant() {
  const { t, lang } = useT();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [voiceNote, setVoiceNote] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<Recognition | null>(null);
  const canListen = typeof window !== "undefined" && speechRecognition() !== null;
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => { endRef.current?.scrollIntoView?.({ block: "end" }); }, [messages, busy]);
  // Stop listening and reading aloud when the chat window is closed (or the app unmounts).
  useEffect(() => {
    const stop = () => { recRef.current?.stop(); window.speechSynthesis?.cancel(); setSpeakingIndex(null); };
    if (!open) stop();
    return () => { recRef.current?.stop(); window.speechSynthesis?.cancel(); };
  }, [open]);

  const lastWithSchemes = [...messages].reverse().find((m) => m.reply && m.reply.sources.length > 0);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    const history: ChatTurn[] = messages.filter((m) => !m.error).slice(-6).map((m) => ({ role: m.role, content: m.text.slice(0, 2000) }));
    const contextIds = (lastWithSchemes?.reply?.sources ?? []).slice(0, 5).map((s) => s.id);
    setMessages((m) => [...m, { role: "user", text: question }]);
    setInput("");
    setBusy(true);
    try {
      const reply = await chatApi.ask(question.slice(0, 1000), history, contextIds, lang);
      setMessages((m) => [...m, { role: "assistant", text: reply.answer, reply }]);
    } catch (e) {
      const msg = e instanceof ApiError && e.status === 429
        ? t("You've asked a lot of questions in a short time. Please wait a minute and try again.")
        : t("Sorry, the assistant is not available right now. Please try again later, or browse All Schemes.");
      setMessages((m) => [...m, { role: "assistant", text: msg, error: true }]);
    } finally {
      setBusy(false);
    }
  };

  const toggleListening = () => {
    const Ctor = speechRecognition();
    if (!Ctor) return;
    if (listening) { recRef.current?.stop(); return; }
    const rec = new Ctor();
    rec.lang = speechLang(lang);
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (e) => {
      const text = Array.from(e.results).map((r) => r[0].transcript).join(" ");
      setInput(text);
      if (Array.from(e.results).every((r) => r.isFinal)) finalText = text;
    };
    rec.onerror = (e) => {
      setVoiceNote(e.error === "not-allowed" || e.error === "service-not-allowed"
        ? t("Microphone permission was not given. You can type your question instead.")
        : t("Sorry, I couldn't hear that. Please try again or type your question."));
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
      if (finalText.trim()) send(finalText);
    };
    recRef.current = rec;
    setVoiceNote("");
    setListening(true);
    rec.start();
  };

  const speak = (index: number, reply: ChatReply) => {
    if (!canSpeak) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    if (speakingIndex === index) { setSpeakingIndex(null); return; }
    const wanted = speechLang(lang).toLowerCase();
    const voice = synth.getVoices().find((v) => v.lang.toLowerCase().replace("_", "-").startsWith(wanted.slice(0, 2)));
    if (lang === "kn" && !voice) {
      setVoiceNote(t("No Kannada voice is installed on this device, so answers can't be read aloud in Kannada. You can install one in your device's language settings."));
      return;
    }
    const u = new SpeechSynthesisUtterance(spokenText(reply));
    u.lang = speechLang(lang);
    if (voice) u.voice = voice;
    u.onend = () => setSpeakingIndex(null);
    u.onerror = () => setSpeakingIndex(null);
    setSpeakingIndex(index);
    synth.speak(u);
  };

  const last = messages[messages.length - 1];

  return (
    <div className="print:hidden">
      {!open && (
        <button type="button" onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 btn btn-primary shadow-lg rounded-full px-5 py-3">
          <MessageCircle className="h-5 w-5" aria-hidden="true" /> {t("Ask SchemeSathi")}
        </button>
      )}
      {open && (
        <section role="dialog" aria-label={t("SchemeSathi assistant")}
          className="fixed bottom-0 right-0 sm:bottom-5 sm:right-5 z-50 w-full sm:w-[28rem] h-[85vh] sm:h-[40rem] flex flex-col card overflow-hidden">
          <header className="bg-navy text-white px-4 py-3 flex items-center justify-between">
            <span className="flex items-center gap-2 font-bold"><Bot className="h-5 w-5 text-yellow" aria-hidden="true" /> {t("SchemeSathi Assistant")}</span>
            <button type="button" onClick={() => setOpen(false)} aria-label={t("Close assistant")} className="p-1 hover:text-yellow">
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted" aria-live="polite">
            {messages.length === 0 && (
              <div className="space-y-3 text-sm">
                <p>{t("Tell me about your situation or ask about a scheme. I'll suggest central and Karnataka schemes and show their benefits, who can apply, documents and how to apply.")}</p>
                <p className="text-xs text-muted-foreground">{t("Please don't share Aadhaar, phone or bank numbers. Messages are not stored.")}</p>
                <div className="space-y-2">
                  {EXAMPLES.map((ex) => (
                    <button key={ex} type="button" onClick={() => send(t(ex))} className="block w-full text-left rounded-lg bg-white border border-border px-3 py-2 hover:border-blue">
                      {t(ex)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                {m.role === "user" ? (
                  <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-blue text-white px-3 py-2 text-sm whitespace-pre-line">{m.text}</p>
                ) : (
                  <div className={`rounded-2xl rounded-bl-sm bg-white border border-border px-3 py-2 text-sm space-y-2 ${m.error ? "text-destructive" : ""}`}>
                    {m.reply?.redacted && (
                      <p className="text-xs text-warning">{t("We removed a number or email from your message to protect your privacy.")}</p>
                    )}
                    <p className="whitespace-pre-line">{tidy(m.text)}</p>
                    {m.reply && canSpeak && (
                      <button type="button" onClick={() => speak(i, m.reply!)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue hover:underline">
                        {speakingIndex === i
                          ? <><Square className="h-3 w-3" aria-hidden="true" /> {t("Stop reading")}</>
                          : <><Volume2 className="h-3.5 w-3.5" aria-hidden="true" /> {t("Read aloud")}</>}
                      </button>
                    )}
                    {m.reply && m.reply.sources.length > 0 && (
                      <ul className="space-y-2 pt-1" aria-label={t("Suggested schemes")}>
                        {m.reply.sources.map((s) => <SchemeCard key={s.label} s={s} onOpen={() => setOpen(false)} />)}
                      </ul>
                    )}
                    {m.reply && m.reply.sources.length > 0 && <p className="text-[11px] text-muted-foreground">{m.reply.disclaimer}</p>}
                  </div>
                )}
              </div>
            ))}
            {!busy && last?.reply && last.reply.sources.length > 0 && (
              <div className="flex flex-wrap gap-1.5" aria-label={t("Follow-up questions")}>
                {FOLLOW_UPS.map((q) => (
                  <button key={q} type="button" onClick={() => send(t(q))}
                    className="rounded-full bg-white border border-border px-3 py-1 text-xs hover:border-blue">
                    {t(q)}
                  </button>
                ))}
              </div>
            )}
            {busy && <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {t("Finding schemes...")}</p>}
            <div ref={endRef} />
          </div>

          {(listening || voiceNote) && (
            <p className="border-t border-border bg-white px-3 pt-2 text-[11px] text-muted-foreground" role="status">
              {listening
                ? t("Listening... Your browser's speech service turns your voice into text (it may send the audio to Google or Microsoft). SchemeSathi does not store it.")
                : voiceNote}
            </p>
          )}
          <form className="border-t border-border p-3 flex gap-2 bg-white" onSubmit={(e) => { e.preventDefault(); send(input); }}>
            <label className="flex-1">
              <span className="sr-only">{t("Your question")}</span>
              <input className="field py-2" value={input} onChange={(e) => setInput(e.target.value)} maxLength={1000}
                placeholder={t("Ask about schemes...")} disabled={busy} />
            </label>
            {canListen && (
              <button type="button" onClick={toggleListening} disabled={busy}
                className={`btn ${listening ? "btn-accent" : "btn-outline"} px-3 py-2`}
                aria-label={listening ? t("Stop listening") : t("Ask by voice")} aria-pressed={listening}>
                {listening ? <MicOff className="h-4 w-4" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />}
              </button>
            )}
            <button type="submit" className="btn btn-primary px-3 py-2" disabled={busy || !input.trim()} aria-label={t("Send")}>
              <Send className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
