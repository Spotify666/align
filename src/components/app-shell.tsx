"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Beaker, Home, List, Mark, Menu, Plus, Shield, Trend, User, Users, Cross } from "./icons";

const PRIMARY = [
  { href: "/analyse", label: "Analyse" },
  { href: "/sessions", label: "Sessions" },
  { href: "/progress", label: "Progress" },
  { href: "/coach", label: "Coach" },
  { href: "/science", label: "Science" },
];

const TABS = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/sessions", label: "Sessions", Icon: List },
  { href: "/analyse", label: "Analyse", Icon: Plus, primary: true },
  { href: "/progress", label: "Progress", Icon: Trend },
  { href: "/profile", label: "Profile", Icon: User },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <div className="min-h-dvh flex flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 btn btn-primary">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-carbon/85 backdrop-blur supports-[backdrop-filter]:bg-carbon/70">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2" aria-label="Align home">
            <Mark />
            <span className="display text-[1.35rem] tracking-[0.04em]">ALIGN</span>
          </Link>
          <nav aria-label="Primary" className="hidden md:flex items-center gap-1 text-sm">
            {PRIMARY.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active(n.href) ? "page" : undefined}
                className={`rounded-lg px-3 py-2 transition-colors ${active(n.href) ? "text-text bg-raised" : "text-muted hover:text-text"}`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/privacy" className="hidden md:inline-flex text-sm text-muted hover:text-text px-2 py-2">
              Privacy
            </Link>
            <Link href="/profile" className="hidden md:inline-flex btn btn-ghost !min-h-9 !py-1.5 text-sm">
              <User size={16} /> Profile
            </Link>
            <Link href="/analyse" className="hidden sm:inline-flex btn btn-primary !min-h-9 !py-1.5 text-sm">
              Analyse a delivery
            </Link>
            <button
              className="md:hidden inline-flex h-11 w-11 items-center justify-center rounded-lg border border-line"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
            >
              {open ? <Cross /> : <Menu />}
            </button>
          </div>
        </div>
        {open && (
          <nav aria-label="More" className="md:hidden border-t border-line bg-carbon px-4 pb-4">
            {[
              { href: "/coach", label: "Coach workspace", Icon: Users },
              { href: "/science", label: "Science and validation", Icon: Beaker },
              { href: "/privacy", label: "Privacy and data", Icon: Shield },
              { href: "/sample", label: "Sample reports", Icon: List },
              { href: "/design-system", label: "Design system", Icon: Menu },
            ].map(({ href, label, Icon }) => (
              <Link key={href} href={href} onClick={() => setOpen(false)} className="flex items-center gap-3 py-3 border-b border-line text-muted">
                <Icon /> {label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <main id="main" className="flex-1 pb-24 md:pb-0">
        {children}
      </main>

      <footer className="hidden md:block border-t border-line">
        <div className="mx-auto max-w-7xl px-6 py-8 text-sm text-subtle flex flex-wrap gap-x-8 gap-y-2">
          <span>Align · cricket movement intelligence</span>
          <Link href="/science" className="hover:text-text">Methodology & validation</Link>
          <Link href="/privacy" className="hover:text-text">Privacy & data</Link>
          <Link href="/design-system" className="hover:text-text">Design system</Link>
          <span className="ml-auto">Prototype engine v0.1 — not validated on real athletes yet.</span>
        </div>
      </footer>

      <nav
        aria-label="Tabs"
        className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-line bg-carbon/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="grid grid-cols-5">
          {TABS.map(({ href, label, Icon, primary }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={active(href) ? "page" : undefined}
                className={`flex h-16 flex-col items-center justify-center gap-1 text-[0.7rem] ${active(href) ? "text-text" : "text-subtle"}`}
              >
                {primary ? (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold text-ink">
                    <Icon size={20} />
                  </span>
                ) : (
                  <Icon size={20} />
                )}
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
