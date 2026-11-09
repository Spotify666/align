// The two-video option's same-ball check by movement (src/engine/same-ball.ts): how closely the
// hands' height follows the same course in two videos, near the offset their shots give.
//  - Real pairs from exported tracks (run.mjs / capture-flow.mjs EXPORT_TRACKS):
//      TRACKS=side=a.b64,front=b.b64,other=c.b64 PAIRS=side:front,other:front
//  - International defences (KU CricShot 3D, KU_DIR): one shot seen from the side and from the
//    bowler's end (the same ball), and two different shots of the same kind (different balls),
//    each played over a different length of time.
//   npx vitest run --config scripts/eval/vitest.config.ts motion --disableConsoleIntercept
import { it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { analyze } from "@/engine/analyze";
import { decodeTracks } from "@/engine/tracks-codec";
import { handsHeight, movementAgreement, shotTime } from "@/engine/same-ball";
import type { CaptureObservation } from "@/engine/types";
import { defenceKind, kuObservation, readKu, type KuShot } from "./ku3d";

const at = { analysisId: "m", createdAt: "2026-01-01T00:00:00.000Z" };
const read = (o: CaptureObservation, target: "front_foot_defence" | "back_foot_defence") => {
  const obs = target === "back_foot_defence" ? { ...o, target } : o;
  return { obs, shot: shotTime(analyze(obs, at), obs), move: handsHeight(obs) };
};
const q = (xs: number[], p: number) => {
  const v = [...xs].sort((a, b) => a - b);
  return v.length ? v[Math.floor(p * (v.length - 1))]! : NaN;
};

it("same ball by movement", { timeout: 3_600_000 }, async () => {
  // Real pairs.
  const tracks = new Map<string, CaptureObservation>();
  for (const kv of (process.env.TRACKS ?? "").split(",").filter(Boolean)) {
    const [name, path] = kv.split("=");
    tracks.set(name!, await decodeTracks(Uint8Array.from(Buffer.from(readFileSync(path!, "utf8").trim(), "base64"))));
  }
  for (const pair of (process.env.PAIRS ?? "").split(",").filter(Boolean)) {
    const [a, b] = pair.split(":");
    const A = read(tracks.get(a!)!, "back_foot_defence");
    const B = read(tracks.get(b!)!, "back_foot_defence");
    if (A.shot === null || B.shot === null || !A.move || !B.move) {
      console.log(pair, "no shot or movement");
      continue;
    }
    const m = movementAgreement(A.move, B.move, A.shot - B.shot);
    console.log(`${pair}: shots ${A.shot.toFixed(2)} / ${B.shot.toFixed(2)} s → offset ${(A.shot - B.shot).toFixed(2)}; movement r ${m?.r.toFixed(3)} at ${m?.lagS.toFixed(2)} s over ${m?.overlapS.toFixed(1)} s`);
  }

  // International defences.
  const DIR = `${process.env.KU_DIR ?? ""}/Defense Shot`;
  if (!existsSync(DIR)) return console.log("KU_DIR not set");
  const shots: KuShot[] = [];
  for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json")).sort()) {
    const s = readKu(`${DIR}/${f}`, f);
    if (s && defenceKind(s) !== "unclear") shots.push(s);
  }
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const view = (s: KuShot, yaw: number, d: number) => {
    const target = defenceKind(s) === "back" ? "back_foot_defence" : "front_foot_defence";
    return read(kuObservation(s, { yaw, distance: 8 }, { durationS: d }), target);
  };
  const same: number[] = [];
  const diff: number[] = [];
  const diffNear: number[] = [];
  for (let k = 0; k < 400; k++) {
    const s = shots[Math.floor(rnd() * shots.length)]!;
    const d = 1.8 + rnd() * 1.2;
    // One ball: the side phone and the front phone see the same movement over the same time.
    const A = view(s, 90, d);
    const B = view(s, 0, d);
    if (A.shot !== null && B.shot !== null && A.move && B.move) {
      const m = movementAgreement(A.move, B.move, A.shot - B.shot);
      if (m) same.push(m.r);
    }
    // Two balls: another defence of the same kind, played over its own length of time.
    let o = shots[Math.floor(rnd() * shots.length)]!;
    while (o === s || defenceKind(o) !== defenceKind(s)) o = shots[Math.floor(rnd() * shots.length)]!;
    const d2 = 1.8 + rnd() * 1.2;
    const C = view(o, 0, d2);
    if (A.shot !== null && C.shot !== null && A.move && C.move) {
      const m = movementAgreement(A.move, C.move, A.shot - C.shot);
      if (m) {
        diff.push(m.r);
        if (Math.abs(d2 - d) < 0.15) diffNear.push(m.r);
      }
    }
  }
  const line = (name: string, xs: number[]) =>
    console.log(`${name.padEnd(46)} n ${String(xs.length).padStart(3)}  r p5/p50/p95 ${[0.05, 0.5, 0.95].map((p) => q(xs, p).toFixed(3)).join("/")}  ≥0.85 ${Math.round((100 * xs.filter((r) => r >= 0.85).length) / Math.max(1, xs.length))}%  ≥0.9 ${Math.round((100 * xs.filter((r) => r >= 0.9).length) / Math.max(1, xs.length))}%  ≥0.95 ${Math.round((100 * xs.filter((r) => r >= 0.95).length) / Math.max(1, xs.length))}%`);
  line("one ball, side + front (KU)", same);
  line("two balls of the same kind (KU)", diff);
  line("two balls, played over nearly the same time", diffNear);
});
