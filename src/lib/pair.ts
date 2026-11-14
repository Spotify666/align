// Two phones filming one ball (Batch 7). The owner's decision (2026-11-14): "pass-through
// only". The phones pair with a short code; the start signal, the clock checks and the second
// phone's result go through the server and are never stored. Never video, never pictures.
//
// This file is the protocol, kept free of any network so it can be tested: the codes, the
// messages, what a result message may carry, the clock offset between the phones, and cutting
// a long message into pieces a broadcast can carry.

export const PAIR_PROTOCOL = "aline.pair/1";

/** No 0/O, 1/I/L: a code read aloud across a net can't be misheard. */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CODE_LENGTH = 6;
/** A session lasts this long from its start; after that its code joins nothing. */
export const SESSION_MINUTES = 30;
/** The countdown before recording, from the moment the first phone taps Start. */
export const COUNTDOWN_S = 5;

export type Role = "side" | "front";
export const ROLE_NAME: Record<Role, string> = { side: "Side-on", front: "From the bowler's end" };
export const otherRole = (r: Role): Role => (r === "side" ? "front" : "side");

export function newCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  // Rejection sampling: every letter equally likely.
  const out: string[] = [];
  while (out.length < CODE_LENGTH) {
    for (const b of random(CODE_LENGTH * 2)) {
      if (b < 256 - (256 % CODE_ALPHABET.length) && out.length < CODE_LENGTH) out.push(CODE_ALPHABET[b % CODE_ALPHABET.length]!);
    }
  }
  return out.join("");
}

/** A code as typed: upper case, without spaces or dashes; null when it can't be one. */
export function cleanCode(typed: string): string | null {
  const c = typed.toUpperCase().replace(/[\s-]/g, "");
  return c.length === CODE_LENGTH && [...c].every((ch) => CODE_ALPHABET.includes(ch)) ? c : null;
}

// ---------- Messages ----------

/** What one phone's result carries to the other: numbers only (declared on the screen). */
export interface ResultMessage {
  t: "result";
  /** The analysis id on the sending phone, so a resend replaces rather than duplicates. */
  id: string;
  title: string;
  recordedAt: string;
  /** Aline's result for this clip (`align.analysis/1`). */
  payload: unknown;
  /** The tracked body points, encoded (`tracks-codec`), base64. */
  tracks: string;
}

export type PairMessage =
  | { t: "hello"; from: string; role: Role; protocol: string; host: boolean }
  /** The first phone accepts one second phone; every other phone's messages are ignored from then on. */
  | { t: "accept"; from: string; peer: string }
  | { t: "ping"; from: string; id: number; sentAt: number }
  | { t: "pong"; from: string; id: number; sentAt: number; receivedAt: number }
  | { t: "countdown"; from: string; startAt: number }
  | { t: "piece"; from: string; msg: string; index: number; count: number; data: string }
  | { t: "received"; from: string; id: string; outcome: "same" | "not_confirmed" };

/** Exactly what a result message may hold. Anything else (a video, a picture, a file) is never sent. */
export const RESULT_KEYS = ["t", "id", "title", "recordedAt", "payload", "tracks"] as const;

export function resultMessage(a: { id: string; title: string; recordedAt: string; payload: unknown }, tracks: Uint8Array): ResultMessage {
  return { t: "result", id: a.id, title: a.title.slice(0, 120), recordedAt: a.recordedAt, payload: a.payload, tracks: toBase64(tracks) };
}

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/**
 * Two digits both phones show once paired, the same on both (they come from both phones' own
 * ids): if they differ, a stranger joined with a guessed code, and the pairing is refused.
 */
export function pairCheck(a: string, b: string): string {
  const [x, y] = [a, b].sort();
  let h = 2166136261;
  for (const ch of `${x}|${y}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return String(h % 100).padStart(2, "0");
}

// ---------- Long messages in pieces ----------

/** Well under a broadcast's message limit, whatever the plan. */
export const PIECE_CHARS = 48_000;

export function toPieces(from: string, msgId: string, text: string, size = PIECE_CHARS): Extract<PairMessage, { t: "piece" }>[] {
  const count = Math.max(1, Math.ceil(text.length / size));
  return Array.from({ length: count }, (_, index) => ({ t: "piece" as const, from, msg: msgId, index, count, data: text.slice(index * size, (index + 1) * size) }));
}

/** Collects pieces; gives the whole text once every piece of a message has arrived (in any order, repeats ignored). */
export class Reassembler {
  private parts = new Map<string, { count: number; got: Map<number, string> }>();
  add(p: Extract<PairMessage, { t: "piece" }>): string | null {
    if (p.count < 1 || p.count > 500 || p.index < 0 || p.index >= p.count) return null;
    const m = this.parts.get(p.msg) ?? { count: p.count, got: new Map<number, string>() };
    if (m.count !== p.count) return null;
    m.got.set(p.index, p.data);
    this.parts.set(p.msg, m);
    if (m.got.size < m.count) return null;
    this.parts.delete(p.msg);
    return Array.from({ length: m.count }, (_, i) => m.got.get(i)!).join("");
  }
}

/** A result message read back, or null when it isn't one or carries anything undeclared. */
export function readResult(text: string): ResultMessage | null {
  let m: unknown;
  try {
    m = JSON.parse(text);
  } catch {
    return null;
  }
  if (!m || typeof m !== "object") return null;
  const o = m as Record<string, unknown>;
  if (o.t !== "result") return null;
  if (Object.keys(o).some((k) => !(RESULT_KEYS as readonly string[]).includes(k))) return null;
  if (typeof o.id !== "string" || typeof o.title !== "string" || typeof o.recordedAt !== "string" || typeof o.tracks !== "string" || !o.payload || typeof o.payload !== "object") return null;
  return o as unknown as ResultMessage;
}

// ---------- The clock between the phones ----------

export interface ClockSample {
  /** When the ping left this phone, by this phone's clock (ms). */
  sentAt: number;
  /** When the other phone received it, by its clock (ms). */
  remoteAt: number;
  /** When the pong came back, by this phone's clock (ms). */
  backAt: number;
}

export interface ClockOffset {
  /** Add to this phone's clock to get the other phone's (ms). */
  offsetMs: number;
  /** How sure: half the quickest round trip (ms). The countdowns agree to within this. */
  uncertaintyMs: number;
  samples: number;
}

/**
 * The other phone's clock relative to this one, from ping-pong samples: the sample with the
 * quickest round trip, assuming the way there took as long as the way back. Null without samples.
 */
export function clockOffset(samples: ClockSample[]): ClockOffset | null {
  const ok = samples.filter((s) => s.backAt >= s.sentAt);
  if (!ok.length) return null;
  const best = ok.reduce((a, b) => (b.backAt - b.sentAt < a.backAt - a.sentAt ? b : a));
  const rtt = best.backAt - best.sentAt;
  return { offsetMs: best.remoteAt - (best.sentAt + rtt / 2), uncertaintyMs: rtt / 2, samples: ok.length };
}

/** How well the phones agree on time, in words (seconds, never milliseconds on screen). */
export function syncWords(c: ClockOffset | null): string {
  if (!c) return "Checking the phones' clocks…";
  const s = c.uncertaintyMs / 1000;
  if (s <= 0.1) return "In time with each other (within a tenth of a second).";
  if (s <= 0.5) return `In time with each other within about ${s.toFixed(1)} seconds.`;
  return "The connection is slow: the countdowns may differ by more than half a second. Start together by voice if needed.";
}
