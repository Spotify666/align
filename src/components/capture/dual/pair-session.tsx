"use client";
// Two phones, one ball. One phone starts a pairing and shows a code; the other joins with it.
// The first phone accepts the second (both show the same check number), the phones agree on
// the time, and the first phone starts a countdown that both show at once. Each phone records
// the ball with its camera app and checks its own clip in Aline. The second phone then sends
// its result to the first, which checks that the two clips show the same ball (the batter's
// movement must line up) before putting both angles together. Nothing is stored on the server,
// and no video or picture ever leaves a phone.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { decodeTracks } from "@/engine/tracks-codec";
import { pairOutcome } from "@/lib/pair-decide";
import { getAnalysis, getTracks, listAnalyses, saveAnalysis, updateAnalysis, type StoredAnalysis } from "@/lib/store";
import { openTransport, type PairTransport } from "@/lib/pair-channel";
import {
  clockOffset,
  cleanCode,
  COUNTDOWN_S,
  fromBase64,
  newCode,
  pairCheck,
  PAIR_PROTOCOL,
  readResult,
  Reassembler,
  resultMessage,
  ROLE_NAME,
  SESSION_MINUTES,
  syncWords,
  toPieces,
  type ClockOffset,
  type ClockSample,
  type PairMessage,
  type Role,
} from "@/lib/pair";

interface Session {
  code: string;
  me: string;
  host: boolean;
  role: Role;
  startedAt: number;
}

const KEY = "aline.pair";
const loadSession = (): Session | null => {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Session | null;
    return s && Date.now() - s.startedAt < SESSION_MINUTES * 60_000 ? s : null;
  } catch {
    return null;
  }
};
// The session lives in this tab's storage, so leaving to check a clip and coming back keeps it.
let memory: string | null = null;
const listeners = new Set<() => void>();
const saveSession = (s: Session | null) => {
  memory = s ? JSON.stringify(s) : null;
  try {
    if (s) sessionStorage.setItem(KEY, memory!);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* private mode: the session lasts as long as the page */
  }
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => {
  try {
    return sessionStorage.getItem(KEY) ?? memory ?? "";
  } catch {
    return memory ?? "";
  }
};
const randomId = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).slice(0, 18);

export function PairSession() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "\u0000");
  const ready = raw !== "\u0000";
  const session = useMemo(() => (ready && raw ? loadSession() : null), [raw, ready]);
  const start = (s: Session) => saveSession(s);
  const end = () => saveSession(null);

  return (
    <div className="mx-auto max-w-xl space-y-8 px-4 py-8 sm:py-12">
      <header className="space-y-2">
        <Link href="/check" className="text-sm text-fg-subtle hover:text-fg">Check your shot</Link>
        <h1 className="display text-4xl">Two phones, one ball</h1>
        <p className="text-fg-muted">One phone side-on, one from the bowler&apos;s end. Pair them, start together, and Aline puts both angles of the ball together.</p>
      </header>
      {!ready ? null : session ? <Paired s={session} onEnd={end} /> : <Choose onStart={start} />}
      <p className="text-xs text-fg-subtle">
        What travels between the phones: the start signal, clock checks, and the second phone&apos;s result (Aline&apos;s numbers and the body points it tracked).
        It passes through Aline&apos;s server and is not stored. Never video, never pictures.
      </p>
    </div>
  );
}

function Choose({ onStart }: { onStart: (s: Session) => void }) {
  const [role, setRole] = useState<Role>("side");
  const [typed, setTyped] = useState("");
  const code = cleanCode(typed);
  return (
    <div className="space-y-6">
      <RolePicker value={role} onChange={setRole} label="This phone films" />
      <section className="panel space-y-3 p-5">
        <h2 className="text-lg font-semibold">First phone</h2>
        <button className="btn btn-primary" onClick={() => onStart({ code: newCode(), me: randomId(), host: true, role, startedAt: Date.now() })}>
          Start a pairing
        </button>
      </section>
      <section className="panel space-y-3 p-5">
        <h2 className="text-lg font-semibold">Second phone</h2>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (code) onStart({ code, me: randomId(), host: false, role, startedAt: Date.now() });
          }}
        >
          <label className="sr-only" htmlFor="pair-code">Code from the first phone</label>
          <input
            id="pair-code"
            className="field num min-w-0 flex-1 text-lg tracking-widest uppercase"
            autoComplete="off"
            inputMode="text"
            maxLength={8}
            placeholder="Code from the first phone"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
          <button className="btn btn-primary" disabled={!code}>Join</button>
        </form>
      </section>
    </div>
  );
}

function RolePicker({ value, onChange, label, disabled }: { value: Role; onChange: (r: Role) => void; label: string; disabled?: Role }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div role="radiogroup" className="flex flex-wrap gap-1.5">
        {(["side", "front"] as const).map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={value === r}
            disabled={disabled === r}
            onClick={() => onChange(r)}
            className={`min-h-11 rounded-full border px-4 text-sm font-medium ${value === r ? "border-fg bg-tint text-fg" : "border-line-strong text-fg-muted hover:text-fg"} disabled:opacity-40`}
          >
            {ROLE_NAME[r]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

type Outcome = { kind: "same"; a: string; b: string } | { kind: "not_confirmed"; why: string };

function Paired({ s, onEnd }: { s: Session; onEnd: () => void }) {
  const [status, setStatus] = useState<"connecting" | "open" | "failed">("connecting");
  const [peer, setPeer] = useState<{ id: string; role: Role; lastSeen: number } | null>(null);
  const [candidate, setCandidate] = useState<{ id: string; role: Role } | null>(null);
  const [accepted, setAccepted] = useState<string | null>(null);
  const [samples, setSamples] = useState<ClockSample[]>([]);
  const [startAt, setStartAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [mine, setMine] = useState<StoredAnalysis[]>([]);
  const [chosen, setChosen] = useState<string>("");
  const [incoming, setIncoming] = useState<StoredAnalysis | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [sent, setSent] = useState<"no" | "sending" | "sent" | "failed">("no");
  const [error, setError] = useState<string | null>(null);
  const transport = useRef<PairTransport | null>(null);
  const pings = useRef(new Map<number, number>());
  const pingId = useRef(0);
  const pieces = useRef(new Reassembler());
  const offset = useMemo(() => clockOffset(samples), [samples]);
  const clockOffsetRef = useRef<ClockOffset | null>(null);
  useEffect(() => {
    clockOffsetRef.current = offset;
  }, [offset]);
  const paired = !!accepted;
  const connected = !!peer && now - peer.lastSeen < 6000;

  const send = useCallback(async (m: PairMessage) => {
    try {
      await transport.current?.send(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The message didn't go through.");
    }
  }, []);

  // Messages from the other phone.
  const onMessage = useCallback(
    async (m: PairMessage) => {
      if (m.from === s.me) return;
      // Once paired, only the paired phone is heard.
      if (accepted && m.from !== accepted) return;
      switch (m.t) {
        case "hello":
          if (m.protocol !== PAIR_PROTOCOL) return;
          if (s.host && !accepted) setCandidate({ id: m.from, role: m.role });
          // The paired phone came back (reloaded, or after checking its clip): accept it again.
          if (s.host && accepted === m.from) void send({ t: "accept", from: s.me, peer: m.from });
          setPeer({ id: m.from, role: m.role, lastSeen: Date.now() });
          return;
        case "accept":
          if (!s.host && m.peer === s.me) {
            setAccepted(m.from);
            setPeer((p) => (p ? { ...p, lastSeen: Date.now() } : p));
          }
          return;
        case "ping":
          setPeer((p) => (p && p.id === m.from ? { ...p, lastSeen: Date.now() } : p));
          await send({ t: "pong", from: s.me, id: m.id, sentAt: m.sentAt, receivedAt: Date.now() });
          return;
        case "pong": {
          const sentAt = pings.current.get(m.id);
          if (sentAt === undefined) return;
          pings.current.delete(m.id);
          setSamples((xs) => [...xs.slice(-19), { sentAt, remoteAt: m.receivedAt, backAt: Date.now() }]);
          setPeer((p) => (p ? { ...p, lastSeen: Date.now() } : p));
          return;
        }
        case "countdown":
          // The first phone's moment, on this phone's clock.
          setStartAt(m.startAt - (clockOffsetRef.current?.offsetMs ?? 0));
          return;
        case "piece": {
          const text = pieces.current.add(m);
          if (!text || !s.host) return;
          const r = readResult(text);
          if (!r) return setError("A result arrived that Aline couldn't read, so it wasn't saved.");
          const stored: StoredAnalysis = {
            id: r.id,
            createdAt: new Date().toISOString(),
            recordedAt: r.recordedAt,
            payload: r.payload as StoredAnalysis["payload"],
            title: r.title || "Other angle",
            notes: "",
            tags: ["two-phones"],
            representative: false,
            cloud: null,
          };
          await saveAnalysis(stored, fromBase64(r.tracks), {});
          setIncoming(stored);
          return;
        }
        case "received":
          setOutcome(m.outcome === "same" ? { kind: "same", a: "", b: "" } : { kind: "not_confirmed", why: "The first phone couldn't confirm the two clips show the same ball." });
          return;
      }
    },
    [accepted, s, send],
  );
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  // The channel, for as long as this screen is open.
  useEffect(() => {
    const t = openTransport(s.code, (m) => void onMessageRef.current(m), setStatus);
    transport.current = t;
    return () => {
      t.close();
      transport.current = null;
    };
  }, [s.code]);

  // Saying hello (until paired, and then as a heartbeat), and the clock checks.
  useEffect(() => {
    if (status !== "open") return;
    const hello = () => void send({ t: "hello", from: s.me, role: s.role, protocol: PAIR_PROTOCOL, host: s.host });
    hello();
    const h = setInterval(hello, 2000);
    return () => clearInterval(h);
  }, [status, s, send]);
  useEffect(() => {
    if (!paired) return;
    const ping = () => {
      const id = ++pingId.current;
      pings.current.set(id, Date.now());
      void send({ t: "ping", from: s.me, id, sentAt: Date.now() });
    };
    ping();
    const p = setInterval(ping, samples.length < 10 ? 700 : 5000);
    return () => clearInterval(p);
  }, [paired, s.me, send, samples.length >= 10]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // This phone's own checked clips (newest first).
  useEffect(() => {
    listAnalyses()
      .then((all) => {
        const own = all.filter((a) => !a.tags.includes("two-phones") && a.payload.mode !== "posture_screen").sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
        setMine(own);
        setChosen((c) => c || own[0]?.id || "");
      })
      .catch(() => {});
  }, [startAt, now > (startAt ?? Infinity) + 10_000]); // eslint-disable-line react-hooks/exhaustive-deps

  // The first phone checks the same ball once it has both results.
  useEffect(() => {
    if (!s.host || !incoming || !chosen || outcome) return;
    (async () => {
      const own = await getAnalysis(chosen);
      const [ta, tb] = await Promise.all([getTracks(chosen), getTracks(incoming.id)]);
      if (!own || !ta || !tb) return setOutcome({ kind: "not_confirmed", why: "One of the two results couldn't be read on this phone." });
      const [oa, ob] = await Promise.all([decodeTracks(ta), decodeTracks(tb)]);
      const r = pairOutcome({ payload: own.payload, obs: oa }, { payload: incoming.payload, obs: ob });
      if (r.together) {
        await updateAnalysis(own.id, { otherAngle: incoming.id });
        await updateAnalysis(incoming.id, { otherAngle: own.id });
        setOutcome({ kind: "same", a: own.id, b: incoming.id });
        void send({ t: "received", from: s.me, id: incoming.id, outcome: "same" });
      } else {
        setOutcome({ kind: "not_confirmed", why: r.why });
        void send({ t: "received", from: s.me, id: incoming.id, outcome: "not_confirmed" });
      }
    })().catch(() => setOutcome({ kind: "not_confirmed", why: "The two clips couldn't be compared on this phone." }));
  }, [s, incoming, chosen, outcome, send]);

  const left = startAt === null ? null : Math.ceil((startAt - now) / 1000);
  const check = accepted ? pairCheck(s.me, accepted) : candidate ? pairCheck(s.me, candidate.id) : null;

  return (
    <div className="space-y-6">
      <section className="panel space-y-3 p-5">
        <p className="text-sm text-fg-muted">This phone: <strong className="text-fg">{ROLE_NAME[s.role]}</strong>{s.host ? " · first phone" : " · second phone"}</p>
        {s.host && (
          <div>
            <p className="text-sm text-fg-muted">Code for the other phone</p>
            <p className="num display text-5xl tracking-[0.2em]" aria-label={`Code ${s.code.split("").join(" ")}`}>{s.code}</p>
          </div>
        )}
        <p role="status" className="text-sm">
          {status === "failed"
            ? "Couldn't reach the server. Check the connection and try again."
            : status === "connecting"
              ? "Connecting…"
              : paired
                ? connected
                  ? "Paired with the other phone."
                  : "The other phone has dropped out. It can come back with the same code."
                : s.host
                  ? candidate
                    ? null
                    : "Waiting for the other phone to join…"
                  : "Waiting for the first phone to accept…"}
        </p>
        {s.host && candidate && !accepted && (
          <div className="space-y-2 rounded-xl border border-line-strong p-4">
            <p>A phone joined, filming <strong>{ROLE_NAME[candidate.role]}</strong>.</p>
            <p className="text-sm text-fg-muted">Both phones should show the same number: <strong className="num text-fg text-lg">{check}</strong></p>
            {candidate.role === s.role && <p className="text-sm text-bad">It films from the same place as this phone. One of you should change position first.</p>}
            <div className="flex flex-wrap gap-2">
              <button
                className="btn btn-primary"
                disabled={candidate.role === s.role}
                onClick={() => {
                  setAccepted(candidate.id);
                  void send({ t: "accept", from: s.me, peer: candidate.id });
                }}
              >
                Same number: pair
              </button>
              <button className="btn btn-ghost" onClick={() => setCandidate(null)}>Not my phone</button>
            </div>
          </div>
        )}
        {!s.host && check && <p className="text-sm text-fg-muted">Check number: <strong className="num text-fg text-lg">{check}</strong>. The first phone shows it too.</p>}
        {paired && <p className="text-sm text-fg-muted">{syncWords(offset)}</p>}
        {status === "failed" && <button className="btn btn-ghost" onClick={() => location.reload()}>Try again</button>}
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      </section>

      {paired && (
        <section className="panel space-y-4 p-5" aria-label="Countdown">
          <h2 className="text-lg font-semibold">1 · Start together</h2>
          {left !== null && left > 0 ? (
            <p className="display num text-7xl" aria-live="assertive">{left}</p>
          ) : left !== null && left > -15 ? (
            <p className="display text-4xl" aria-live="assertive">Record now</p>
          ) : (
            <p className="text-sm text-fg-muted">
              {s.host ? `Tap Start when both phones are in place. Both phones count down ${COUNTDOWN_S} seconds; press record in the camera app at "Record now".` : "The first phone starts the countdown. Press record in the camera app at \"Record now\"."}
            </p>
          )}
          {s.host && (left === null || left < -15) && (
            <button
              className="btn btn-primary"
              onClick={() => {
                const at = Date.now() + COUNTDOWN_S * 1000;
                setStartAt(at);
                void send({ t: "countdown", from: s.me, startAt: at });
              }}
            >
              Start countdown
            </button>
          )}
        </section>
      )}

      {paired && (
        <section className="panel space-y-4 p-5" aria-label="Results">
          <h2 className="text-lg font-semibold">2 · Check each clip, then put them together</h2>
          <p className="text-sm text-fg-muted">On each phone, check its own clip in Aline, then come back here (this pairing stays open for {SESSION_MINUTES} minutes).</p>
          <Link href="/check" className="btn btn-ghost">Check my clip</Link>
          {mine.length > 0 && (
            <label className="block text-sm">
              <span className="font-medium">This phone&apos;s clip</span>
              <select className="field mt-1 w-full" value={chosen} onChange={(e) => setChosen(e.target.value)}>
                {mine.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title || "Shot"} · {new Date(a.createdAt).toLocaleTimeString()}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!s.host && (
            <>
              <button
                className="btn btn-primary"
                disabled={!chosen || !connected || sent === "sending"}
                onClick={async () => {
                  setSent("sending");
                  setError(null);
                  try {
                    const a = await getAnalysis(chosen);
                    const t = await getTracks(chosen);
                    if (!a || !t) throw new Error("This clip's result isn't on this phone.");
                    const text = JSON.stringify(resultMessage(a, t));
                    for (const p of toPieces(s.me, `${a.id}-${Date.now()}`, text)) await transport.current?.send(p);
                    setSent("sent");
                  } catch (e) {
                    setSent("failed");
                    setError(e instanceof Error ? e.message : "Couldn't send. Try again.");
                  }
                }}
              >
                {sent === "sending" ? "Sending…" : sent === "sent" ? "Send again" : "Send to the first phone"}
              </button>
              <p className="text-xs text-fg-subtle">Sends Aline&apos;s result for this clip and the body points it tracked. Not the video, not pictures.</p>
              {sent === "sent" && !outcome && <p role="status" className="text-sm">Sent. The first phone puts both angles together.</p>}
            </>
          )}
          {s.host && !incoming && <p className="text-sm text-fg-muted">Waiting for the other phone&apos;s result…</p>}
          {outcome?.kind === "same" && (
            <div role="status" className="space-y-2">
              <p className="font-medium text-ok">Same ball: both angles are together.</p>
              {s.host && <Link href={`/angles?a=${outcome.a}&b=${outcome.b}`} className="btn btn-primary">Open both angles</Link>}
              {!s.host && <p className="text-sm text-fg-muted">Open them on the first phone.</p>}
            </div>
          )}
          {outcome?.kind === "not_confirmed" && (
            <p role="status" className="text-sm">
              <strong>Not put together.</strong> {outcome.why}
            </p>
          )}
        </section>
      )}

      <button className="btn btn-ghost" onClick={onEnd}>End this pairing</button>
    </div>
  );
}
