"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AnalysisPayload, CaptureObservation, EventType, ImgPoint, LinePartId, Metric } from "@/engine/types";
import { J } from "@/engine/types";
import { buildScene, semanticToJoint } from "@/engine/scene";
import { templateReport } from "@/engine/report";
import { plainSummary, readingLevel, friendlyRange, friendlyValue, type ReadingLevel, type SummaryKind } from "@/engine/summary";
import { plainReading } from "@/engine/plain";
import { BONES } from "@/lib/viz";
import { loadProfile } from "@/lib/store";
import { downloadReportPdf } from "@/lib/pdf";

const noSubscribe = () => () => {};
const SHOT_NAME = { front_foot_defence: "Front-foot defence", back_foot_defence: "Back-foot defence" } as const;
const KIND_WORD: Record<SummaryKind, string> = { good: "Good", fix: "Fix", tip: "Tip", info: "" };
const PART_NAME: Record<LinePartId, string> = { head: "Head", shoulder: "Front shoulder", knee: "Front knee" };
const PART_JOINT: Record<LinePartId, "head" | "front_shoulder" | "front_knee"> = { head: "head", shoulder: "front_shoulder", knee: "front_knee" };

/** The moments printed, in order: the top of the backlift, the foot landing, contact. */
const MOMENTS: Array<{ types: EventType[]; name: string }> = [
  { types: ["backswing_top", "trigger"], name: "Backlift" },
  { types: ["front_foot_plant", "back_foot_commit"], name: "Foot down" },
  { types: ["contact"], name: "Contact" },
];

interface Moment {
  name: string;
  frame: number;
  /** Seconds from the start of the clip. */
  at: number;
  contact: boolean;
}

function momentsOf(p: AnalysisPayload, obs: CaptureObservation): Moment[] {
  if (p.mode === "posture_screen") return [{ name: "Your position", frame: p.line?.referenceFrame ?? 0, at: 0, contact: true }];
  const t0 = obs.t[0] ?? 0;
  const seen = new Set<number>();
  const out: Moment[] = [];
  for (const m of MOMENTS) {
    const e = m.types.map((t) => p.events.find((x) => x.type === t)).find(Boolean);
    if (!e || seen.has(e.frame)) continue;
    seen.add(e.frame);
    out.push({ name: m.name, frame: e.frame, at: ((obs.t[e.frame] ?? t0) - t0) / 1000, contact: e.type === "contact" });
  }
  return out;
}

const PRIORITY_PART: Record<string, LinePartId> = { line_head: "head", line_shoulder: "shoulder", line_knee: "knee" };

/**
 * The part of the line to mark on the contact frame: only the one the plan asks to fix (so the
 * page and the summary say the same thing), and only while it is out of its range there.
 */
function toFix(p: AnalysisPayload): { part: LinePartId; words: string } | null {
  const l = p.line;
  const part = p.plan ? PRIORITY_PART[p.plan.priority.metricId] : undefined;
  if (!l || !part || p.analysis_status !== "valid") return null;
  const v = l.atReference[part];
  const [lo, hi] = l.bands[part];
  if (v === null || (v >= lo && v <= hi)) return null;
  const words = l.axis === "forward" ? (v < lo ? "behind the front foot" : "too far ahead of the front foot") : "out of line";
  return { part, words };
}

/**
 * One frame of the clip, printed: the picture kept from the recording (when there is one), the
 * tracked body in thin ink, the line (front foot, front knee, front shoulder, head) in the
 * accent, and on the contact frame a ring and a label on each part of the line out of its range.
 * Drawn once into a canvas; nothing moves.
 */
function PrintFrame({ obs, frame, image, mark, front }: { obs: CaptureObservation; frame: number; image: string | null; mark: { part: LinePartId; words: string } | null; front: "left" | "right" }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"drawing" | "photo" | "body">("drawing");
  // The drawing, kept as a compressed picture: what the page and the PDF show.
  const [picture, setPicture] = useState<string | null>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const fr = obs.body[frame] ?? [];
    const pts = fr.filter((q): q is NonNullable<ImgPoint> => !!q && q[2] >= 0.3);
    if (pts.length < 6) return;
    // The batter, with room around: a 4:5 crop of the picture.
    const aspect = obs.media.width / Math.max(1, obs.media.height);
    const xs = pts.map((q) => q[0]);
    const ys = pts.map((q) => q[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    let h = (Math.max(...ys) - Math.min(...ys)) * 1.35;
    let w = (h * 0.8) / aspect;
    w = Math.max(w, (Math.max(...xs) - Math.min(...xs)) * 1.3);
    h = Math.max(h, (w * aspect) / 0.8);
    const view = { x: cx - w / 2, y: cy - h / 2, w, h };
    const W = 480;
    const H = 600;
    c.width = Math.round(W * 1.5);
    c.height = Math.round(H * 1.5);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(1.5, 1.5);
    const X = (x: number) => ((x - view.x) / view.w) * W;
    const Y = (y: number) => ((y - view.y) / view.h) * H;
    const css = getComputedStyle(c);
    const ink = css.getPropertyValue("--fg").trim() || "#111";
    const accent = css.getPropertyValue("--brand").trim() || "#B54700";
    const paper = css.getPropertyValue("--paper").trim() || "#fff";

    const finish = (photo: boolean) => {
      // Body: thin ink, dotted where the tracker was unsure.
      ctx.lineCap = "round";
      for (const [a, b] of BONES) {
        const pa = fr[J[a]];
        const pb = fr[J[b]];
        if (!pa || !pb) continue;
        const low = Math.min(pa[2], pb[2]) < 0.5;
        ctx.setLineDash(low ? [2, 4] : []);
        ctx.strokeStyle = photo ? "rgba(255,255,255,0.92)" : ink;
        ctx.lineWidth = low ? 1.2 : 2;
        ctx.beginPath();
        ctx.moveTo(X(pa[0]), Y(pa[1]));
        ctx.lineTo(X(pb[0]), Y(pb[1]));
        ctx.stroke();
      }
      ctx.setLineDash([]);
      // The line: front foot, front knee, front shoulder, head.
      const at = (s: "front_ankle" | "front_knee" | "front_shoulder" | "head") => fr[J[semanticToJoint(s, front)]];
      const line = (["front_ankle", "front_knee", "front_shoulder", "head"] as const).map(at);
      if (line.every(Boolean)) {
        ctx.strokeStyle = accent;
        ctx.lineWidth = 3;
        ctx.beginPath();
        line.forEach((q, i) => (i ? ctx.lineTo(X(q![0]), Y(q![1])) : ctx.moveTo(X(q![0]), Y(q![1]))));
        ctx.stroke();
        ctx.fillStyle = accent;
        for (const q of line) {
          ctx.beginPath();
          ctx.arc(X(q![0]), Y(q![1]), 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // What to fix, on the part itself: a ring (the words are under the picture, where they can be read).
      const q = mark ? at(PART_JOINT[mark.part]) : null;
      if (q) {
        ctx.strokeStyle = photo ? "#fff" : paper;
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.arc(X(q[0]), Y(q[1]), 24, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 4;
        ctx.setLineDash([7, 4]);
        ctx.beginPath();
        ctx.arc(X(q[0]), Y(q[1]), 24, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      setPicture(c.toDataURL("image/jpeg", 0.82));
      setState(photo ? "photo" : "body");
    };

    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, W, H);
    if (!image) return finish(false);
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, view.x * img.naturalWidth, view.y * img.naturalHeight, view.w * img.naturalWidth, view.h * img.naturalHeight, 0, 0, W, H);
      finish(true);
    };
    img.onerror = () => finish(false);
    img.src = image;
  }, [obs, frame, image, mark, front]);
  return (
    <>
      <canvas ref={ref} className="hidden" aria-hidden />
      {picture ? (
        // A picture made on this device from the report's own data.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={picture} alt="" className="block aspect-[4/5] w-full rounded-lg border border-line" />
      ) : (
        <span className="block aspect-[4/5] w-full rounded-lg border border-line" aria-hidden />
      )}
      {state === "body" && <span className="mt-1 block text-xs text-fg-subtle">Drawn from the tracked body; no picture was kept for this moment.</span>}
    </>
  );
}

function MetricRows({ metrics, level }: { metrics: Metric[]; level: ReadingLevel }) {
  const shown = metrics.filter((m) => m.status !== "not_measured" && m.value !== null);
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-line-strong text-left text-fg-muted">
          <th className="py-1.5 pr-3 font-medium">Check</th>
          {level !== "simple" && <th className="py-1.5 pr-3 font-medium">You</th>}
          {level !== "simple" && <th className="py-1.5 pr-3 font-medium">Aim for</th>}
          <th className="py-1.5 font-medium">Reading</th>
        </tr>
      </thead>
      <tbody>
        {shown.map((m) => {
          const off = m.inRange === false;
          return (
            <tr key={m.id} className="print-keep border-b border-line align-top">
              <td className={`py-1.5 pr-3 ${off ? "font-semibold" : ""}`}>
                {off && <span aria-label="out of range">! </span>}
                {m.name}
              </td>
              {level !== "simple" && <td className="py-1.5 pr-3 num">{friendlyValue(m)}</td>}
              {level !== "simple" && <td className="py-1.5 pr-3 num text-fg-muted">{m.range ? friendlyRange(m) : "—"}</td>}
              <td className={`py-1.5 ${off ? "font-semibold" : "text-fg-muted"}`}>{m.inRange === null ? "not graded" : plainReading(m)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * The report laid out for paper and for "Save as PDF": the summary, three moments of the clip
 * with the line and what to fix drawn on them, the training plan, the measures and the limits.
 * Always in the daylight theme, readable in greyscale (every state is also a word or a mark).
 * Made from the same payload as the screen, so the two never disagree.
 */
export function PrintReport({ payload: p, obs, keyframes, title, backHref, unchosen }: { payload: AnalysisPayload; obs: CaptureObservation; keyframes: Record<number, string>; title?: string; backHref: string; unchosen?: boolean }) {
  const level = useSyncExternalStore(noSubscribe, () => readingLevel(loadProfile().ageBand, loadProfile().level), () => "plain" as ReadingLevel);
  const sum = plainSummary(p, { mediaKind: obs.media.kind, level, unchosen });
  const report = templateReport(p);
  const moments = momentsOf(p, obs);
  const mark = toFix(p);
  const front = buildScene(obs).front;
  const shot = SHOT_NAME[p.requested_shot ?? "front_foot_defence"];
  const valid = p.analysis_status === "valid";
  const [busy, setBusy] = useState(false);

  // Paper is light: the daylight theme while this page is open (set before the frames draw).
  useLayoutEffect(() => {
    const root = document.documentElement;
    const was = root.getAttribute("data-theme");
    root.setAttribute("data-theme", "light");
    return () => {
      if (was) root.setAttribute("data-theme", was);
      else root.removeAttribute("data-theme");
    };
  }, []);

  return (
    <main id="main" className="print-report mx-auto max-w-3xl bg-bg px-4 py-6 text-fg sm:px-8">
      <div className="no-print mb-6 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          Save as PDF or print
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await downloadReportPdf(p, { title });
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Preparing…" : "Simple PDF"}
        </button>
        <Link href={backHref} className="btn btn-quiet">Back to the report</Link>
        <p className="w-full text-xs text-fg-subtle">“Save as PDF” opens your phone&apos;s print screen: choose “Save as PDF” there. “Simple PDF” downloads a text-only version.</p>
      </div>

      <header className="flex items-start justify-between gap-4 border-b border-line-strong pb-3">
        <div>
          <p className="text-sm font-semibold tracking-[0.2em]">ALINE</p>
          <p className="mt-1 text-sm text-fg-muted">
            {shot} · {new Date(p.created_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
            {title ? ` · ${title}` : ""}
          </p>
        </div>
        <p className="text-right text-sm">
          <span className="font-semibold">{sum.angle.short}</span>
          <span className="block text-fg-muted">{sum.angle.long}</span>
        </p>
      </header>
      {p.demo && <p className="mt-2 text-sm font-semibold">Sample made from generated movement, not a real recording.</p>}

      <section aria-labelledby="p-summary" className="print-keep mt-5">
        <h1 id="p-summary" className="display text-3xl">{sum.verdict}</h1>
        <ul className="mt-3 space-y-1.5">
          {sum.lines.map((l) => (
            <li key={l.text} className="text-[1.02rem]">
              {KIND_WORD[l.kind] && <span className="font-semibold">{KIND_WORD[l.kind]}: </span>}
              {l.text}
            </li>
          ))}
        </ul>
      </section>

      {moments.length > 0 && (
        <section aria-labelledby="p-moments" className="mt-6">
          <h2 id="p-moments" className="text-lg font-semibold">
            {p.mode === "posture_screen" ? "Your position" : "Three moments of the shot"}
          </h2>
          <p className="text-sm text-fg-muted">
            The line Aline reads: front foot, front knee, front shoulder and head.{mark ? " The ring marks what to fix." : ""}
          </p>
          <div className={`mt-3 grid gap-3 ${moments.length === 1 ? "max-w-xs" : "grid-cols-3"}`}>
            {moments.map((m) => (
              <figure key={m.frame} className="print-keep">
                <PrintFrame obs={obs} frame={m.frame} image={keyframes[m.frame] ?? null} mark={m.contact ? mark : null} front={front} />
                <figcaption className="mt-1 text-sm">
                  <span className="font-semibold">{m.name}</span>
                  {p.mode !== "posture_screen" && <span className="num text-fg-muted"> · {m.at.toFixed(2)} s</span>}
                  {m.contact && mark && (
                    <span className="block">
                      Ring: {PART_NAME[mark.part].toLowerCase()} {mark.words}.
                    </span>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {p.plan && (
        <section aria-labelledby="p-plan" className="print-keep mt-6">
          <h2 id="p-plan" className="text-lg font-semibold">What to work on</h2>
          <p className="mt-1 font-semibold">{p.plan.priority.title}</p>
          <p className="text-fg-muted">{p.plan.priority.observation}</p>
          <p className="mt-2">
            <span className="font-semibold">Remember: </span>“{p.plan.cue}”
          </p>
          <ol className="mt-3 space-y-2">
            {p.plan.drills.map((d, i) => (
              <li key={d.id} className="print-keep border-l-2 border-line-strong pl-3">
                <p className="font-semibold">
                  {i + 1}. {d.name}
                </p>
                <p className="text-sm">{d.constraint}</p>
                <p className="text-sm text-fg-muted">
                  {d.dosage}. Done when: {d.passCondition}
                </p>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-sm text-fg-muted">{p.plan.retest}</p>
        </section>
      )}

      {valid && (
        <section aria-labelledby="p-measures" className="mt-6">
          <h2 id="p-measures" className="text-lg font-semibold">Every check</h2>
          <p className="mb-2 text-sm text-fg-muted">“!” marks a check outside its range. Ranges are provisional coaching ranges.</p>
          <MetricRows metrics={p.metrics} level={level} />
        </section>
      )}

      <section aria-labelledby="p-words" className="mt-6">
        <h2 id="p-words" className="text-lg font-semibold">In plain words</h2>
        {report.sections.map((s) => (
          <div key={s.heading} className="print-keep mt-2">
            <h3 className="text-sm font-semibold">{s.heading}</h3>
            <ul className="mt-1 space-y-1 text-sm">
              {s.sentences.map((x, i) => (
                <li key={i}>{x.text}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <footer className="mt-8 border-t border-line-strong pt-3 text-xs text-fg-muted">
        <p>Not a medical assessment. Movement indicators describe technique, not health or injury.</p>
        <p className="num mt-1">
          Aline {p.versions.engine} · result {p.result_hash.slice(0, 12)}
        </p>
      </footer>
    </main>
  );
}
