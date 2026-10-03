"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Beaker, Home, List, Mark, Menu, Plus, Shield, Trend, User, Users, Cross, Info } from "./icons";
import { ThemeToggle } from "./theme-toggle";

const PRIMARY = [
  { href: "/guide", label: "How it works" },
  { href: "/sessions", label: "Sessions" },
  { href: "/progress", label: "Progress" },
  { href: "/coach", label: "Coach" },
  { href: "/science", label: "Science" },
];

const TABS = [
  { href: "/home", label: "Home", Icon: Home },
  { href: "/sessions", label: "Sessions", Icon: List },
  { href: "/analyse", label: "Analyse", Icon: Plus, primary: true },
  { href: "/progress", label: "Progress", Icon: Trend },
  { href: "/profile", label: "Profile", Icon: User },
];

const MORE = [
  { href: "/guide", label: "How to analyse a shot", Icon: Info },
  { href: "/coach", label: "Coach workspace", Icon: Users },
  { href: "/science", label: "Science and validation", Icon: Beaker },
  { href: "/privacy", label: "Privacy and data", Icon: Shield },
  { href: "/sample", label: "Sample reports", Icon: List },
  { href: "/design-system", label: "Design system", Icon: Menu },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const active = (href: string) => path.startsWith(href);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  // The landing page stands on its own, without the app's header, tabs or footer.
  if (path === "/") return <>{children}</>;

  return (
    <div className="min-h-dvh flex flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 btn btn-primary">
        Skip to content
      </a>
      <header
        className={`sticky top-0 z-40 pt-[env(safe-area-inset-top)] transition-[background-color,border-color,backdrop-filter] duration-200 ${
          scrolled || open ? "border-b border-line bg-bg/80 backdrop-blur-xl" : "border-b border-transparent bg-bg/0"
        }`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <Link href="/home" className="flex items-center gap-2" aria-label="Align home" onClick={() => setOpen(false)}>
            <Mark size={28} />
            <span className="text-[1.08rem] font-semibold tracking-[-0.02em]">Align</span>
          </Link>
          <nav aria-label="Primary" className="hidden lg:flex items-center gap-0.5 text-sm">
            {PRIMARY.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active(n.href) ? "page" : undefined}
                className={`relative rounded-lg px-3 py-2 transition-colors ${active(n.href) ? "text-fg" : "text-fg-muted hover:text-fg"}`}
              >
                {active(n.href) && <motion.span layoutId="nav-pill" className="absolute inset-0 -z-10 rounded-lg bg-tint" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/profile" className="hidden lg:inline-flex btn btn-quiet !min-h-9 !px-3 !py-1.5 text-sm">
              <User size={16} /> Profile
            </Link>
            <Link href="/analyse" className="hidden sm:inline-flex btn btn-primary !min-h-10 !py-1.5 text-sm">
              Analyse front-foot defence
            </Link>
            <button
              className="lg:hidden inline-flex h-11 w-11 items-center justify-center rounded-xl border border-line-strong bg-surface"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="more-menu"
              onClick={() => setOpen((o) => !o)}
            >
              {open ? <Cross /> : <Menu />}
            </button>
          </div>
        </div>
        <AnimatePresence>
          {open && (
            <motion.nav
              id="more-menu"
              aria-label="More"
              className="lg:hidden overflow-hidden border-t border-line bg-bg"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <ul className="px-4 py-2">
                {MORE.map(({ href, label, Icon }, i) => (
                  <motion.li key={href} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.02 * i }}>
                    <Link href={href} onClick={() => setOpen(false)} className="flex min-h-12 items-center gap-3 border-b border-line text-fg-muted hover:text-fg">
                      <Icon /> {label}
                    </Link>
                  </motion.li>
                ))}
              </ul>
              <div className="flex items-center justify-between px-4 pb-4 text-sm text-fg-subtle">
                <span>Appearance</span>
                <ThemeToggle />
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </header>

      <main id="main" className="flex-1 pb-[calc(5.25rem+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </main>

      <footer className="hidden md:block border-t border-line">
        <div className="mx-auto max-w-7xl px-6 py-10 grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-8 text-sm">
          <div className="space-y-3">
            <span className="flex items-center gap-2 font-semibold"><Mark size={18} /> Align</span>
            <p className="text-fg-subtle max-w-xs">Cricket shot analysis that confirms the shot before it grades it. Starting with the front-foot defence.</p>
            <ThemeToggle />
          </div>
          <div className="space-y-2">
            <p className="font-medium">Product</p>
            <Link href="/analyse" className="block text-fg-subtle hover:text-fg">Analyse front-foot defence</Link>
            <Link href="/guide" className="block text-fg-subtle hover:text-fg">How it works</Link>
            <Link href="/sample" className="block text-fg-subtle hover:text-fg">Sample reports</Link>
          </div>
          <div className="space-y-2">
            <p className="font-medium">For coaches</p>
            <Link href="/coach" className="block text-fg-subtle hover:text-fg">Coach workspace</Link>
            <Link href="/progress" className="block text-fg-subtle hover:text-fg">Progress</Link>
          </div>
          <div className="space-y-2">
            <p className="font-medium">Trust</p>
            <Link href="/science" className="block text-fg-subtle hover:text-fg">Science and validation</Link>
            <Link href="/privacy" className="block text-fg-subtle hover:text-fg">Privacy and data</Link>
            <Link href="/design-system" className="block text-fg-subtle hover:text-fg">Design system</Link>
          </div>
        </div>
        <div className="border-t border-line">
          <p className="mx-auto max-w-7xl px-6 py-4 text-xs text-fg-subtle">Prototype engine v0.1 — not yet validated on real athletes. Not a medical assessment.</p>
        </div>
      </footer>

      <nav aria-label="Tabs" className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
        <ul className="grid grid-cols-5">
          {TABS.map(({ href, label, Icon, primary }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={active(href) ? "page" : undefined}
                className={`relative flex h-[4.25rem] flex-col items-center justify-center gap-1 text-[0.68rem] font-medium transition-colors ${active(href) ? "text-fg" : "text-fg-subtle"}`}
              >
                {primary ? (
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand text-brand-fg shadow-sm">
                    <Icon size={20} />
                  </span>
                ) : (
                  <Icon size={21} />
                )}
                {label}
                {active(href) && !primary && <motion.span layoutId="tab-dot" className="absolute top-1.5 h-1 w-6 rounded-full bg-brand" />}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
