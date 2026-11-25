import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { HeartPulse, Languages, Menu, X } from "lucide-react";
import { tx, useT } from "../i18n";
import ChatAssistant from "./ChatAssistant";

const NAV = [
  { to: "/", label: tx("Home") },
  { to: "/#how-it-works", label: tx("How it Works") },
  { to: "/#schemes", label: tx("Reviewed Schemes") },
  { to: "/catalogue", label: tx("All Schemes") },
];

export function Logo() {
  return (
    <span className="flex items-center gap-2 font-extrabold text-2xl text-white">
      <HeartPulse className="h-7 w-7 text-yellow" aria-hidden="true" />
      SchemeSathi
    </span>
  );
}

/**
 * The router changes the address but does not scroll. Scroll to "#section" links
 * (How it Works, Reviewed Schemes), or to the top when opening a new page.
 */
function useScrollToHash() {
  const { pathname, hash, key } = useLocation();
  useEffect(() => {
    if (!hash) {
      window.scrollTo?.({ top: 0 });
      return;
    }
    let tries = 0;
    const timer = window.setInterval(() => {
      const el = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (el || ++tries > 20) {  // the page may still be rendering: retry for up to 1 second
        el?.scrollIntoView?.({ behavior: "smooth", block: "start" });
        window.clearInterval(timer);
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [pathname, hash, key]); // key changes on every click, so clicking the same link again still scrolls
}

export default function Layout() {
  const [open, setOpen] = useState(false);
  const { t, lang, setLang } = useT();
  useScrollToHash();
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:p-2 focus:bg-yellow">
        {t("Skip to content")}
      </a>
      <header className="sticky top-0 z-40 bg-navy text-white print:hidden">
        <nav className="container-tight px-4 md:px-6 h-18 py-4 flex items-center justify-between" aria-label="Main">
          <Link to="/" aria-label={t("SchemeSathi home")}><Logo /></Link>
          <button className="md:hidden p-2" aria-label={open ? t("Close menu") : t("Open menu")} aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? <X /> : <Menu />}
          </button>
          <div className={`${open ? "flex" : "hidden"} md:flex absolute md:static top-full inset-x-0 flex-col md:flex-row md:items-center gap-2 md:gap-8 bg-navy p-4 md:p-0`}>
            <ul className="flex flex-col md:flex-row gap-1 md:gap-8">
              {NAV.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} onClick={() => setOpen(false)} className="block py-2 text-sm font-medium text-white/90 hover:text-yellow">
                    {t(item.label)}
                  </NavLink>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setLang(lang === "en" ? "kn" : "en")}
              aria-label={lang === "en" ? "Change language to Kannada" : "ಭಾಷೆಯನ್ನು ಇಂಗ್ಲಿಷ್‌ಗೆ ಬದಲಿಸಿ"}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 px-3 py-2 text-sm font-semibold hover:border-yellow hover:text-yellow">
              <Languages className="h-4 w-4" aria-hidden="true" />
              <span lang={lang === "en" ? "kn" : "en"}>{lang === "en" ? "ಕನ್ನಡ" : "English"}</span>
            </button>
            <Link to="/questionnaire" onClick={() => setOpen(false)} className="btn btn-accent py-2.5">
              {t("Check Eligibility")}
            </Link>
          </div>
        </nav>
      </header>

      <main id="main" className="flex-1">
        <Outlet />
      </main>

      <ChatAssistant />

      <footer className="band-navy mt-20 print:hidden">
        <div className="container-tight px-4 md:px-6 py-14 grid gap-10 md:grid-cols-3 text-sm">
          <div>
            <Logo />
            <p className="mt-4 text-white/80 max-w-xs">
              {t("Helping people in India find public health schemes, understand benefits and check eligibility, using official government sources.")}
            </p>
          </div>
          <div>
            <h2 className="font-bold text-base">{t("Explore")}</h2>
            <ul className="mt-4 space-y-2 text-white/80">
              <li><Link className="hover:text-yellow" to="/">{t("Home")}</Link></li>
              <li><Link className="hover:text-yellow" to="/questionnaire">{t("Check Eligibility")}</Link></li>
              <li><a className="hover:text-yellow" href="https://www.myscheme.gov.in/" target="_blank" rel="noreferrer">MyScheme.gov.in</a></li>
              <li><a className="hover:text-yellow" href="https://beneficiary.nha.gov.in/" target="_blank" rel="noreferrer">{t("Ayushman Bharat portal")}</a></li>
              <li><Link className="hover:text-yellow" to="/admin/login">{t("Admin sign in")}</Link></li>
            </ul>
          </div>
          <div role="note" aria-label={t("Disclaimer")}>
            <h2 className="font-bold text-base">{t("Disclaimer")}</h2>
            <p className="mt-4 text-white/85">
              {t("SchemeSathi is")} <strong className="text-yellow">{t("not an official government service")}</strong>{" "}
              {t("and is not affiliated with any government body. Always confirm eligibility on the official scheme portal before applying. We do not store your answers.")}
            </p>
          </div>
        </div>
        <p className="container-tight px-4 md:px-6 border-t border-white/20 py-6 text-xs text-white/70">
          © {new Date().getFullYear()} SchemeSathi
        </p>
      </footer>
    </div>
  );
}
