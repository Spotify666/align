"use client";
// The visitor log, page side: pages seen, buttons used, analyses tried and time spent in one
// visit (a browser tab; a new visit after 30 minutes away). Nothing is sent until a person
// does something (a real tap, key, scroll or mouse move), and never from automated
// browsers, so crawlers and bots aren't logged. No typed text, file names or media.
// The place and IP are added by the server (/api/visit).

import { LIMITS, type VisitBeacon, type VisitEvent } from "./visit-shared";

const VISITOR = "align:visitor";
const VISIT = "align:visit";
/** "off": this browser isn't logged (set for the site's owner on the visitors page). */
export const VISITS_OFF = "align:visits";
const NEW_VISIT_AFTER = 30 * 60 * 1000;
const IDLE_AFTER = 5 * 60 * 1000;
const SEND_EVERY = 30 * 1000;

interface Visit {
  s: string;
  start: number;
  last: number;
  active: number;
  paths: string[];
  events: VisitEvent[];
}

let visit: Visit | null = null;
let visitor = "";
let human = false;
let lastInput = 0;
let lastTick = 0;
let dirty = false;
let started = false;
let pending: Array<[string, string | undefined]> = [];

const store = {
  get(k: string, s: Storage | undefined) {
    try {
      return s?.getItem(k) ?? null;
    } catch {
      return null;
    }
  },
  set(k: string, v: string, s: Storage | undefined) {
    try {
      s?.setItem(k, v);
    } catch {
      // Private mode or storage blocked: the visit still works in memory.
    }
  },
};
const local = () => (typeof localStorage !== "undefined" ? localStorage : undefined);
const session = () => (typeof sessionStorage !== "undefined" ? sessionStorage : undefined);
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

/** Automated or opted out: log nothing. */
function excluded(): boolean {
  const nav = navigator as Navigator & { webdriver?: boolean; globalPrivacyControl?: boolean };
  if (nav.webdriver) return true;
  if (/HeadlessChrome|Lighthouse|bot|crawl|spider|preview/i.test(nav.userAgent)) return true;
  if (!nav.languages || nav.languages.length === 0) return true;
  if (window.outerWidth === 0 || window.outerHeight === 0) return true;
  // The browser asks not to be tracked.
  if (nav.globalPrivacyControl || nav.doNotTrack === "1") return true;
  return store.get(VISITS_OFF, local()) === "off";
}

function save() {
  if (visit) store.set(VISIT, JSON.stringify(visit), session());
}

function load(now: number): Visit {
  try {
    const v = JSON.parse(store.get(VISIT, session()) ?? "null") as Visit | null;
    if (v && typeof v.s === "string" && now - v.last < NEW_VISIT_AFTER) return v;
  } catch {
    // A new visit.
  }
  return { s: newId(), start: now, last: now, active: 0, paths: [], events: [] };
}

/** Count time while the page is visible and in use (not left open and idle). */
function tick() {
  if (!visit) return;
  const now = Date.now();
  if (document.visibilityState === "visible") {
    if (now - lastInput < IDLE_AFTER) {
      visit.active += Math.max(0, Math.min(now - lastTick, 10_000));
      dirty = true;
    }
    visit.last = now;
  }
  lastTick = now;
  save();
}

function beacon(): VisitBeacon | null {
  if (!visit) return null;
  const b: VisitBeacon = { s: visit.s, v: visitor, a: Math.round(visit.active), p: visit.paths, e: visit.events };
  try {
    const r = document.referrer ? new URL(document.referrer) : null;
    if (r && r.host !== location.host) b.r = r.host;
  } catch {
    // No referrer.
  }
  b.l = navigator.language;
  b.sc = `${screen.width}x${screen.height}`;
  if (hints.model) b.m = hints.model;
  if (hints.platformVersion) b.pv = hints.platformVersion;
  return b;
}

function send() {
  if (!human || !visit) return;
  tick();
  const b = beacon();
  if (!b) return;
  dirty = false;
  const body = JSON.stringify(b);
  if (body.length > LIMITS.body) return;
  try {
    if (navigator.sendBeacon?.("/api/visit", new Blob([body], { type: "application/json" }))) return;
  } catch {
    // Fall through to fetch.
  }
  void fetch("/api/visit", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => undefined);
}

const hints: { model?: string; platformVersion?: string } = {};

function push(k: string, d?: string) {
  if (!visit) return;
  const t = Date.now() - visit.start;
  const prev = visit.events[visit.events.length - 1];
  if (prev && prev.k === k && prev.d === d && t - prev.t < 2000) return;
  if (visit.events.length >= LIMITS.events) return;
  visit.events.push(d ? { t, k, d } : { t, k });
  dirty = true;
  save();
}

/** Record something the person did ("analyse", "result", "failed", …), with a short detail. */
export function track(kind: string, detail?: string) {
  if (!started) {
    if (pending.length < 20) pending.push([kind, detail]);
    return;
  }
  if (!visit) return;
  lastInput = Date.now();
  push(kind, detail?.slice(0, 80));
}

/** Record a page (called on every route change). */
export function trackPage(path: string) {
  if (!started) {
    if (pending.length < 20) pending.push(["page", path]);
    return;
  }
  if (!visit) return;
  const p = path.split(/[?#]/)[0]!.slice(0, 120);
  if (visit.paths[visit.paths.length - 1] !== p && visit.paths.length < LIMITS.paths) visit.paths.push(p);
  push("page", p);
}

/** The label of what was tapped: its own words, never typed text or an email. */
function labelOf(el: Element): string | null {
  const t = (el.getAttribute("aria-label") || (el as HTMLElement).innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  if (!t || t.includes("@")) return null;
  return t.length > 48 ? `${t.slice(0, 47)}…` : t;
}

/** Start the log for this tab. Safe to call more than once. */
export function startVisits() {
  if (started || typeof window === "undefined") return;
  started = true;
  if (excluded()) {
    pending = [];
    return;
  }
  const now = Date.now();
  visitor = store.get(VISITOR, local()) ?? "";
  if (!/^[A-Za-z0-9-]{8,64}$/.test(visitor)) {
    visitor = newId();
    store.set(VISITOR, visitor, local());
  }
  visit = load(now);
  lastTick = now;
  lastInput = now;
  for (const [k, d] of pending) {
    if (k === "page" && d) trackPage(d);
    else track(k, d);
  }
  pending = [];

  const nav = navigator as Navigator & { userAgentData?: { getHighEntropyValues?: (h: string[]) => Promise<{ model?: string; platformVersion?: string }> } };
  void nav.userAgentData
    ?.getHighEntropyValues?.(["model", "platformVersion"])
    .then((h) => {
      if (h.model) hints.model = h.model;
      if (h.platformVersion) hints.platformVersion = h.platformVersion;
    })
    .catch(() => undefined);

  // A person: trusted input only (scripts can't make these). The first one starts sending.
  let moved = 0;
  const onInput = (e: Event) => {
    if (!e.isTrusted) return;
    if (e.type === "pointermove") {
      const p = e as PointerEvent;
      moved += Math.abs(p.movementX) + Math.abs(p.movementY);
      if (moved < 40) return;
    }
    lastInput = Date.now();
    if (!human) {
      human = true;
      send();
    }
  };
  for (const type of ["pointerdown", "keydown", "touchstart", "wheel", "scroll", "pointermove"]) window.addEventListener(type, onInput, { passive: true, capture: true });

  // What was tapped.
  document.addEventListener(
    "click",
    (e) => {
      if (!e.isTrusted) return;
      const el = (e.target as Element | null)?.closest?.("button, a, [role=button], [role=tab], summary, label");
      if (!el) return;
      const label = labelOf(el);
      if (label) push("tap", label);
    },
    { capture: true },
  );

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") return send();
    const now = Date.now();
    lastTick = now;
    lastInput = now;
    // Back after a long time away: a new visit, starting on this page.
    if (visit && now - visit.last > NEW_VISIT_AFTER) {
      const page = visit.paths[visit.paths.length - 1];
      visit = { s: newId(), start: now, last: now, active: 0, paths: [], events: [] };
      if (page) trackPage(page);
      save();
    }
  });
  window.addEventListener("pagehide", () => send());
  setInterval(tick, 5000);
  setInterval(() => {
    if (dirty && document.visibilityState === "visible") send();
  }, SEND_EVERY);
}
