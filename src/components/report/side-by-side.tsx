"use client";
// Two shots side by side at the same moments of the shot (backlift, foot down, contact), each
// placed by its own clip's events: the batter's shot beside their own earlier attempt, or beside
// the textbook defence Aline's test generator makes. Drawn only from tracked points (the
// lesson's rule: what wasn't seen isn't drawn), each figure framed on its own feet and height
// and both at one scale, so a difference in shape is a difference in the movement.

import { useMemo, useState } from "react";
import { analyze } from "@/engine/analyze";
import { generate } from "@/engine/fixtures/generate";
import { FIXTURE_SPECS } from "@/engine/fixtures";
import { ffdScript } from "@/engine/fixtures/index";
import type { AnalysisPayload, CaptureObservation, ImgPoint } from "@/engine/types";
import { figurePose, LandmarkFigure, posePoints, PAPER, INK, type FigurePose } from "@/components/lesson/figure";
import { momentsOf } from "./moments";

export interface SideShot {
  obs: CaptureObservation;
  payload: AnalysisPayload;
  label: string;
}

type Hand = "right" | "left";
const textbookCache: Partial<Record<Hand, SideShot>> = {};

/** The textbook defence, played by the test generator for a batter of this hand (drawn for that hand, not mirrored). */
function textbookShot(hand: Hand): SideShot {
  const hit = textbookCache[hand];
  if (hit) return hit;
  const spec = FIXTURE_SPECS.find((s) => s.key === "valid_ffd")!.options;
  const obs = generate({ ...spec, script: ffdScript(), handedness: hand, id: `textbook_video_${hand}` } as never) as CaptureObservation;
  const shot = { obs, payload: analyze(obs, { analysisId: obs.id, createdAt: "2026-01-01T00:00:00.000Z" }), label: "Textbook defence" };
  textbookCache[hand] = shot;
  return shot;
}

function poseAt(s: SideShot, frame: number): FigurePose | null {
  const body = s.obs.body[frame];
  if (!body) return null;
  const hand: Hand = s.payload.handedness ?? s.obs.athlete.handedness;
  const bat: [ImgPoint | undefined, ImgPoint | undefined] = s.obs.bat.source === "none" ? [undefined, undefined] : [s.obs.bat.handle[frame], s.obs.bat.toe[frame]];
  return figurePose(body, s.obs.media.width / s.obs.media.height, hand, bat);
}

interface Pair {
  name: string;
  you: FigurePose | null;
  them: FigurePose | null;
}

function pairsOf(you: SideShot, them: SideShot): Pair[] {
  const a = momentsOf(you.payload, you.obs);
  const b = momentsOf(them.payload, them.obs);
  return a.map((m) => {
    const o = b.find((x) => x.name === m.name);
    return { name: m.name, you: poseAt(you, m.frame), them: o ? poseAt(them, o.frame) : null };
  });
}

/** Side-on and confirmed: the shots a side-by-side can be drawn for. */
export const sideOnFrontFoot = (p: AnalysisPayload) =>
  p.analysis_status === "valid" && p.mode !== "posture_screen" && (p.requested_shot ?? "front_foot_defence") === "front_foot_defence" && p.camera_view !== "front_on" && p.camera_view !== "behind";

export function SideBySide({ you, previous }: { you: SideShot; previous: SideShot | null }) {
  const hand: Hand = you.payload.handedness ?? you.obs.athlete.handedness;
  const [with_, setWith] = useState<"previous" | "textbook">(previous ? "previous" : "textbook");
  const them = useMemo(() => (with_ === "previous" && previous ? previous : textbookShot(hand)), [with_, previous, hand]);
  const pairs = useMemo(() => pairsOf(you, them), [you, them]);
  const generated = them !== previous;

  return (
    <section aria-labelledby="sbs-h" className="panel space-y-4 p-5">
      <header className="space-y-1">
        <h3 id="sbs-h" className="text-lg font-semibold">Side by side</h3>
        <p className="text-sm text-fg-muted">
          The same moments of the shot, found in each clip on its own. Solid where Aline was sure, dotted where it was unsure; what it didn&apos;t see
          isn&apos;t drawn.
        </p>
      </header>
      {previous && (
        <div role="radiogroup" aria-label="Compare with" className="flex flex-wrap gap-1.5">
          {(
            [
              ["previous", "Your last attempt"],
              ["textbook", "Textbook defence"],
            ] as const
          ).map(([id, name]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={with_ === id}
              onClick={() => setWith(id)}
              className={`min-h-11 rounded-full border px-4 text-sm font-medium ${with_ === id ? "border-fg bg-tint text-fg" : "border-line-strong text-fg-muted hover:text-fg"}`}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-fg-subtle">
        {generated
          ? `Illustration: the textbook defence as Aline's test generator plays it for a ${hand}-handed batter, filmed side-on. Not a real player.`
          : `${previous!.label} · the same camera position and batting hand, both confirmed.`}
      </p>
      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {pairs.map((p) => (
          <li key={p.name} className="rounded-xl border border-line p-2">
            <p className="px-1 text-sm font-medium">{p.name}</p>
            <PairFigure pair={p} themLabel={generated ? "Textbook" : "Last attempt"} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function PairFigure({ pair, themLabel }: { pair: Pair; themLabel: string }) {
  // One scale for both figures: the union of their points, each figure on its own half.
  const pts = [...(pair.you ? posePoints(pair.you) : []), ...(pair.them ? posePoints(pair.them) : [])];
  if (!pts.length) return <p className="p-2 text-sm text-fg-subtle">Not found in either clip.</p>;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const half = Math.max(30, ...xs.map((x) => Math.abs(x))) + 8;
  const top = Math.min(...ys) - 10;
  const bottom = Math.max(104, ...ys) + 4;
  const w = half * 2;
  const h = bottom - top;
  // Labels the same size on screen whatever the figures' scale.
  const fs = h * 0.055;
  const panel = (p: FigurePose | null, label: string, dx: number) => (
    <g transform={`translate(${dx} 0)`}>
      <line x1={-half + 4} x2={half - 4} y1={100.5} y2={100.5} stroke={INK} strokeWidth={0.5} opacity={0.35} />
      {p ? (
        <LandmarkFigure p={p} />
      ) : (
        <text x={0} y={(top + bottom) / 2} textAnchor="middle" fontSize={fs} fill={INK} opacity={0.7}>
          Not found
        </text>
      )}
      <text x={0} y={bottom - 1} textAnchor="middle" fontSize={fs} fill={INK}>
        {label}
      </text>
    </g>
  );
  return (
    <svg
      viewBox={`${-half} ${top} ${w * 2} ${h + 6}`}
      className="mt-1 block w-full rounded-lg"
      style={{ background: PAPER }}
      role="img"
      aria-label={`${pair.name}: your shot on the left, ${themLabel.toLowerCase()} on the right`}
    >
      {panel(pair.you, "You", 0)}
      {panel(pair.them, themLabel, w)}
    </svg>
  );
}
