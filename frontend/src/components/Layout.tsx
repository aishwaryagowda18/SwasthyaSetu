import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { HeartPulse, Menu, X } from "lucide-react";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/#how-it-works", label: "How it Works" },
  { to: "/#schemes", label: "Schemes" },
];

export function Logo() {
  return (
    <span className="flex items-center gap-2 font-extrabold text-2xl text-white">
      <HeartPulse className="h-7 w-7 text-yellow" aria-hidden="true" />
      SchemeSathi
    </span>
  );
}

export default function Layout() {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:p-2 focus:bg-yellow">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 bg-navy text-white print:hidden">
        <nav className="container-tight px-4 md:px-6 h-18 py-4 flex items-center justify-between" aria-label="Main">
          <Link to="/" aria-label="SchemeSathi home"><Logo /></Link>
          <button className="md:hidden p-2" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? <X /> : <Menu />}
          </button>
          <div className={`${open ? "flex" : "hidden"} md:flex absolute md:static top-full inset-x-0 flex-col md:flex-row md:items-center gap-2 md:gap-8 bg-navy p-4 md:p-0`}>
            <ul className="flex flex-col md:flex-row gap-1 md:gap-8">
              {NAV.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} onClick={() => setOpen(false)} className="block py-2 text-sm font-medium text-white/90 hover:text-yellow">
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
            <Link to="/questionnaire" onClick={() => setOpen(false)} className="btn btn-accent py-2.5">
              Check Eligibility
            </Link>
          </div>
        </nav>
      </header>

      <main id="main" className="flex-1">
        <Outlet />
      </main>

      <footer className="band-navy mt-20 print:hidden">
        <div className="container-tight px-4 md:px-6 py-14 grid gap-10 md:grid-cols-3 text-sm">
          <div>
            <Logo />
            <p className="mt-4 text-white/80 max-w-xs">
              Helping people in India find public health schemes, understand benefits and check eligibility, using
              official government sources.
            </p>
          </div>
          <div>
            <h2 className="font-bold text-base">Explore</h2>
            <ul className="mt-4 space-y-2 text-white/80">
              <li><Link className="hover:text-yellow" to="/">Home</Link></li>
              <li><Link className="hover:text-yellow" to="/questionnaire">Check Eligibility</Link></li>
              <li><a className="hover:text-yellow" href="https://www.myscheme.gov.in/" target="_blank" rel="noreferrer">MyScheme.gov.in</a></li>
              <li><a className="hover:text-yellow" href="https://beneficiary.nha.gov.in/" target="_blank" rel="noreferrer">Ayushman Bharat portal</a></li>
              <li><Link className="hover:text-yellow" to="/admin/login">Admin sign in</Link></li>
            </ul>
          </div>
          <div role="note" aria-label="Disclaimer">
            <h2 className="font-bold text-base">Disclaimer</h2>
            <p className="mt-4 text-white/85">
              SchemeSathi is <strong className="text-yellow">not an official government service</strong> and is not
              affiliated with any government body. Always confirm eligibility on the official scheme portal before
              applying. We do not store your answers.
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
