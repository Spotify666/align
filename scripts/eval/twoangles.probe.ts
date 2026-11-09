// The two-video option across ranges, not one clip: real batting (KU CricShot 3D) recorded by two
// virtual phones, one from the side and one from the bowler's end, each with its own position,
// distance, frame rate, start and stop, pose jitter and dropped wrists, playing the shot at its
// own speed. For one ball, for two different balls of the same shot, and for two different shots:
// how often each check (camera angle, same ball) says yes, overall and per range of each factor.
//   KU_DIR=… [N=600] npx vitest run --config scripts/eval/vitest.config.ts twoangles --disableConsoleIntercept
import { it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { analyze } from "@/engine/analyze";
import { guessView, twoAngleView } from "@/lib/capture/view-guess";
import { handsHeight, movementAgreement, shotMovementAgreement, shotTime, type Movement } from "@/engine/same-ball";
import { th } from "@/engine/registry";
import { J, type CameraPoint, type CaptureObservation, type ImgPoint, type TargetShot } from "@/engine/types";
import { defenceKind, kuObservation, readKu, type KuShot } from "./ku3d";

let seed = 20261109;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const uni = (a: number, b: number) => a + (b - a) * rnd();
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]!;
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());

interface Phone {
  yaw: number;
  distance: number;
  fps: number;
  /** Seconds recorded before the shot starts and after it ends. */
  pre: number;
  post: number;
  /** Pose jitter (share of the frame) and depth jitter (m). */
  noise: number;
  worldNoise: number;
  /** Share of frames whose wrists the pose model loses. */
  dropout: number;
}

/** One phone's recording of a shot played over `play` seconds: stance before, hold after. */
function phoneClip(s: KuShot, play: number, ph: Phone, target: TargetShot): CaptureObservation {
  const base = kuObservation(s, { yaw: ph.yaw, distance: ph.distance }, { durationS: play, target });
  const n = base.body.length;
  const m = Math.max(10, Math.floor((ph.pre + play + ph.post) * ph.fps));
  const t: number[] = [];
  const body: ImgPoint[][] = [];
  const world: CameraPoint[][] = [];
  const sway = rnd() * 6;
  for (let k = 0; k < m; k++) {
    const tau = -ph.pre + k / ph.fps;
    const u = Math.min(Math.max(tau, 0), play - 1e-6) * (n / play);
    const i = Math.min(n - 2, Math.floor(u));
    const w = u - i;
    // A batter is never quite still: a little sway in the stance and the hold.
    const still = tau < 0 || tau > play ? 0.002 * Math.sin(2.1 * tau + sway) : 0;
    const lost = rnd() < ph.dropout;
    body.push(
      base.body[i]!.map((p, j) => {
        const q = base.body[i + 1]![j]!;
        const wrist = j === J.left_wrist || j === J.right_wrist;
        if (wrist && lost) return [NaN, NaN, 0.2] as const;
        return [p[0] + (q[0] - p[0]) * w + still + ph.noise * gauss(), p[1] + (q[1] - p[1]) * w + ph.noise * gauss(), p[2]] as const;
      }),
    );
    world.push(
      base.poseWorld![i]!.map((p, j) => {
        const q = base.poseWorld![i + 1]![j]!;
        return [p[0] + (q[0] - p[0]) * w + ph.worldNoise * gauss(), p[1] + (q[1] - p[1]) * w + ph.worldNoise * gauss(), p[2] + (q[2] - p[2]) * w + ph.worldNoise * gauss(), p[3]] as const;
      }),
    );
    t.push((k * 1000) / ph.fps);
  }
  return {
    ...base,
    t,
    body,
    poseWorld: world,
    media: { ...base.media, fps: ph.fps, frameCount: m, durationMs: (m * 1000) / ph.fps, sourceStartMs: 0 },
    quality: { frames: Array.from({ length: 24 }, (_, kq) => ({ frame: Math.floor((kq * m) / 24), brightness: 0.5, contrast: 0.2, sharpness: 0.02, backgroundMotion: 0.008 })), maxPeople: 1 },
  };
}

const sidePhone = (): Phone => ({ yaw: (rnd() < 0.5 ? 1 : -1) * uni(70, 110), distance: uni(4, 12), fps: pick([15, 25, 30, 60]), pre: uni(0.3, 2.5), post: uni(0.3, 2.5), noise: uni(0, 0.008), worldNoise: uni(0, 0.03), dropout: uni(0, 0.15) });
const frontPhone = (): Phone => ({ yaw: uni(-20, 20), distance: uni(10, 22), fps: pick([15, 25, 30, 60]), pre: uni(0.3, 2.5), post: uni(0.3, 2.5), noise: uni(0, 0.012), worldNoise: uni(0, 0.04), dropout: uni(0, 0.2) });

type Read = { obs: CaptureObservation; shot: number | null; move: Movement | null; ok: boolean };
function read(s: KuShot, play: number, ph: Phone, want: "side_on" | "front_on"): Read {
  const target: TargetShot = defenceKind(s) === "back" ? "back_foot_defence" : "front_foot_defence";
  const obs = phoneClip(s, play, ph, target);
  // The angle, from the frames before the stroke, as the capture flow reads it.
  const before = obs.t.map((x, i) => [x / 1000 - ph.pre, i] as const).filter(([tau]) => tau < 0.4 * play).map(([, i]) => ({ body: obs.body[i]!, world: obs.poseWorld![i]! }));
  const ok = twoAngleView(guessView(before as never, s.handedness === "left" ? "left" : "right"), want);
  return { obs, shot: shotTime(analyze(obs, { analysisId: "b", createdAt: "2026-01-01T00:00:00.000Z" }), obs), move: handsHeight(obs), ok };
}

// Candidate logic: the movement lined up over every offset (no anchor from the shot moments,
// which each camera reads on its own), accepted only when the best match is close and stands
// out from every other offset; with one signal (hands) or several (hands, head, hips).
const RATE = 30;
type Sig = { t: number[]; h: number[] };
function heights(obs: CaptureObservation, joints: number[][]): Sig[] {
  const n = obs.body.length;
  const y = (i: number, j: number) => obs.body[i]?.[j]?.[1] ?? NaN;
  const med = (xs: number[]) => { const v = xs.filter(Number.isFinite).sort((p, q) => p - q); return v.length ? v[Math.floor(v.length / 2)]! : NaN; };
  const ank = Array.from({ length: n }, (_, i) => med([y(i, J.left_ankle), y(i, J.right_ankle)]));
  const feet = med(ank);
  const tall = med(Array.from({ length: n }, (_, i) => ank[i]! - y(i, J.nose)));
  return joints.map((js) => {
    const t: number[] = [];
    const h: number[] = [];
    for (let i = 0; i < n; i++) {
      const v = js.map((j) => y(i, j)).filter(Number.isFinite);
      if (!v.length) continue;
      t.push((obs.t[i]! - obs.t[0]!) / 1000 + (obs.media.sourceStartMs ?? 0) / 1000);
      h.push((feet - v.reduce((p, q) => p + q, 0) / v.length) / tall);
    }
    return { t, h };
  });
}
const grid = (m: Sig, from: number, to: number) => {
  const out: number[] = [];
  let k = 0;
  for (let x = from; x <= to + 1e-9; x += 1 / RATE) {
    while (k < m.t.length - 2 && m.t[k + 1]! < x) k++;
    if (m.t.length < 2 || x < m.t[0]! || x > m.t[m.t.length - 1]!) out.push(NaN);
    else { const t0 = m.t[k]!, t1 = m.t[k + 1]!; out.push(t1 > t0 ? m.h[k]! + ((m.h[k + 1]! - m.h[k]!) * (x - t0)) / (t1 - t0) : m.h[k]!); }
  }
  return out;
};
const corr = (xa: number[], xb: number[]) => {
  const ps = xa.map((v, i) => [v, xb[i]!] as const).filter(([p, q]) => Number.isFinite(p) && Number.isFinite(q));
  if (ps.length < 20) return NaN;
  const ma = ps.reduce((s, [p]) => s + p, 0) / ps.length, mb = ps.reduce((s, [, q]) => s + q, 0) / ps.length;
  let ab = 0, aa = 0, bb = 0;
  for (const [p, q] of ps) { ab += (p - ma) * (q - mb); aa += (p - ma) ** 2; bb += (q - mb) ** 2; }
  return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : NaN;
};
/** Mean correlation over the signals at every offset (b shifted by lag), overlap ≥ minOverlap s. */
function scan(A: Sig[], B: Sig[], minOverlap = 1.2) {
  const out: Array<{ lag: number; r: number }> = [];
  const a0 = A[0]!.t[0]!, a1 = A[0]!.t.at(-1)!, b0 = B[0]!.t[0]!, b1 = B[0]!.t.at(-1)!;
  for (let lag = a0 - b1 + minOverlap; lag <= a1 - b0 - minOverlap + 1e-9; lag += 1 / RATE) {
    const from = Math.max(a0, b0 + lag), to = Math.min(a1, b1 + lag);
    if (to - from < minOverlap) continue;
    const rs = A.map((sa, i) => corr(grid(sa, from, to), grid(B[i]!, from - lag, to - lag)));
    if (rs.some((r) => !Number.isFinite(r))) continue;
    out.push({ lag, r: rs.reduce((s, r) => s + r, 0) / rs.length });
  }
  return out;
}
function standout(A: Sig[], B: Sig[]) {
  const all = scan(A, B);
  if (all.length < 10) return null;
  const best = all.reduce((p, q) => (q.r > p.r ? q : p));
  const rs = all.map((x) => x.r).sort((p, q) => p - q);
  const med = rs[Math.floor(rs.length / 2)]!;
  const mad = 1.4826 * [...rs.map((r) => Math.abs(r - med))].sort((p, q) => p - q)[Math.floor(rs.length / 2)]!;
  // Second-best peak at least 0.3 s away: a lone, clear peak, not a broad ridge of similar shapes.
  const far = all.filter((x) => Math.abs(x.lag - best.lag) > 0.3);
  const second = far.length ? Math.max(...far.map((x) => x.r)) : -1;
  return { r: best.r, lag: best.lag, z: mad > 0 ? (best.r - med) / mad : 0, gap: best.r - second };
}
const HANDS = [[J.left_wrist, J.right_wrist]];
const BODY3 = [[J.left_wrist, J.right_wrist], [J.nose], [J.left_hip, J.right_hip]];
const cache = new WeakMap<CaptureObservation, Record<string, Sig[]>>();
const sigs = (r: Read, name: string, joints: number[][]) => { const c = cache.get(r.obs) ?? {}; cache.set(r.obs, c); return (c[name] ??= heights(r.obs, joints)); };

type Logic = { name: string; same: (a: Read, b: Read) => boolean };
const LOGICS: Logic[] = [
  {
    name: "whole clips (live)",
    same: (a, b) => {
      if (a.shot === null || b.shot === null || !a.move || !b.move) return false;
      const m = movementAgreement(a.move, b.move, a.shot - b.shot, undefined, { windowS: 0.4, minOverlapS: 1.5 });
      return !!m && m.r >= 0.95;
    },
  },
  {
    name: "around the shot (PR #44)",
    same: (a, b) => {
      if (a.shot === null || b.shot === null || !a.move || !b.move) return false;
      const m = shotMovementAgreement(a.move, b.move, a.shot, b.shot);
      return !!m && m.r >= th("pair.motion.min_r");
    },
  },
  ...[0.9, 0.95].flatMap((R) => [
    { name: `free hands r≥${R}`, same: (a: Read, b: Read) => { const x = standout(sigs(a, "h", HANDS), sigs(b, "h", HANDS)); return !!x && x.r >= R; } },
    { name: `free hands r≥${R} gap≥0.05`, same: (a: Read, b: Read) => { const x = standout(sigs(a, "h", HANDS), sigs(b, "h", HANDS)); return !!x && x.r >= R && x.gap >= 0.05; } },
    { name: `free body3 r≥${R}`, same: (a: Read, b: Read) => { const x = standout(sigs(a, "b3", BODY3), sigs(b, "b3", BODY3)); return !!x && x.r >= R; } },
    { name: `free body3 r≥${R} gap≥0.05`, same: (a: Read, b: Read) => { const x = standout(sigs(a, "b3", BODY3), sigs(b, "b3", BODY3)); return !!x && x.r >= R && x.gap >= 0.05; } },
  ]),
];

it("candidates on real pairs", async () => {
  if (!process.env.TRACKS) return;
  const { decodeTracks } = await import("@/engine/tracks-codec");
  const { readFileSync } = await import("node:fs");
  const obs = new Map<string, CaptureObservation>();
  for (const kv of process.env.TRACKS.split(",")) {
    const [k, path] = kv.split("=");
    obs.set(k!, await decodeTracks(Uint8Array.from(Buffer.from(readFileSync(path!, "utf8").trim(), "base64"))));
  }
  for (const pr of (process.env.PAIRS ?? "").split(",")) {
    const [a, b] = pr.split(":");
    const A = obs.get(a!)!, B = obs.get(b!)!;
    const h = standout(heights(A, HANDS), heights(B, HANDS));
    const b3 = standout(heights(A, BODY3), heights(B, BODY3));
    console.log(`REAL ${pr}: hands r ${h?.r.toFixed(3)} at ${h?.lag.toFixed(2)} s (gap ${h?.gap.toFixed(2)}); hands+head+hips r ${b3?.r.toFixed(3)} at ${b3?.lag.toFixed(2)} s (gap ${b3?.gap.toFixed(2)})`);
  }
});

it("two angles across ranges", { timeout: 7_200_000 }, () => {
  const ROOT = process.env.KU_DIR ?? "";
  if (!existsSync(`${ROOT}/Defense Shot`)) return console.log("KU_DIR not set");
  if (process.env.TRACKS) return;
  const load = (dir: string, every = 1) =>
    readdirSync(`${ROOT}/${dir}`).filter((x) => x.endsWith(".json")).sort().filter((_, i) => i % every === 0).map((f) => readKu(`${ROOT}/${dir}/${f}`, f)).filter((s): s is KuShot => !!s);
  const defences = load("Defense Shot").filter((s) => defenceKind(s) !== "unclear");
  const others = [...load("Drive_Shot", 4), ...load("Pull_Shot", 4), ...load("Flick_Shot", 4)];
  const N = Number(process.env.N ?? 600);
  type Row = { kind: string; f: Record<string, number>; angleSide: boolean; angleFront: boolean; sideAsFront: boolean; angled: boolean; same: boolean[]; diff: boolean[]; other: boolean[] };
  const rows: Row[] = [];
  for (let k = 0; k < N; k++) {
    const s = pick(defences);
    const play = uni(1.6, 3.0);
    const ps = sidePhone();
    const pf = frontPhone();
    const A = read(s, play, ps, "side_on");
    const B = read(s, play, pf, "front_on");
    // Another ball of the same shot, and another shot, through the same front phone.
    let o = pick(defences);
    while (o === s || defenceKind(o) !== defenceKind(s)) o = pick(defences);
    const C = read(o, uni(1.6, 3.0), pf, "front_on");
    const D = read(pick(others), uni(1.6, 3.0), pf, "front_on");
    // An angled phone (40–50° off the bowler's end) must not pass as either angle.
    const angledYaw = (rnd() < 0.5 ? 1 : -1) * uni(40, 50);
    const E = read(s, play, { ...pf, yaw: angledYaw }, "front_on");
    const Es = read(s, play, { ...pf, yaw: angledYaw }, "side_on");
    const sideAsFront = twoAngleView(guessView(A.obs.body.map((b, i) => ({ body: b, world: A.obs.poseWorld![i]! })).slice(0, Math.round(A.obs.body.length * 0.4)) as never, "right"), "front_on");
    if (process.env.DEBUG && k < 25) {
      const lagTrue = ps.pre - pf.pre;
      const m = A.move && B.move && A.shot !== null && B.shot !== null ? movementAgreement(A.move, B.move, A.shot - B.shot, undefined, { windowS: 0.4, minOverlapS: 1.0 }) : null;
      const g = A.move && B.move ? movementAgreement(A.move, B.move, lagTrue, undefined, { windowS: 0.05, minOverlapS: 1.0 }) : null;
      console.log(`${defenceKind(s)} play ${play.toFixed(2)} fps ${ps.fps}/${pf.fps} | shots A ${A.shot === null ? "—" : (A.shot - ps.pre).toFixed(2)} B ${B.shot === null ? "—" : (B.shot - pf.pre).toFixed(2)} (from the shot's start) → lag ${A.shot !== null && B.shot !== null ? (A.shot - B.shot).toFixed(2) : "—"} vs true ${lagTrue.toFixed(2)} | movement near shots r ${m?.r.toFixed(3)} @${m?.lagS.toFixed(2)} | at the true lag r ${g?.r.toFixed(3)} | angle F ${B.ok}`);
    }
    rows.push({
      kind: defenceKind(s),
      f: { fps: Math.min(ps.fps, pf.fps) + 0.001 * Math.max(ps.fps, pf.fps), noise: pf.noise, dropout: pf.dropout, front_yaw: Math.abs(pf.yaw), side_yaw: Math.abs(Math.abs(ps.yaw) - 90), pre: Math.min(ps.pre, pf.pre), post: Math.min(ps.post, pf.post), play },
      angleSide: A.ok,
      angleFront: B.ok,
      sideAsFront,
      angled: E.ok || Es.ok,
      same: LOGICS.map((l) => l.same(A, B)),
      diff: LOGICS.map((l) => l.same(A, C)),
      other: LOGICS.map((l) => l.same(A, D)),
    });
  }
  const pct = (xs: boolean[]) => `${Math.round((100 * xs.filter(Boolean).length) / Math.max(1, xs.length))}%`.padStart(4);
  console.log(`\n${rows.length} trials (KU defences ${defences.length}, other shots ${others.length})`);
  console.log(`angle: side phone read as side ${pct(rows.map((r) => r.angleSide))} · front phone as front ${pct(rows.map((r) => r.angleFront))} · side phone wrongly as front ${pct(rows.map((r) => r.sideAsFront))} · 40–50° phone passed ${pct(rows.map((r) => r.angled))}`);
  LOGICS.forEach((l, i) => console.log(`same ball [${l.name}]: one ball ${pct(rows.map((r) => r.same[i]!))} · two balls, same shot ${pct(rows.map((r) => r.diff[i]!))} · two shots ${pct(rows.map((r) => r.other[i]!))}`));
  for (const kind of ["front", "back"]) {
    const rs = rows.filter((r) => r.kind === kind);
    console.log(`  ${kind}-foot defences (${rs.length}): angle front ${pct(rs.map((r) => r.angleFront))}; ` + LOGICS.map((l, i) => `${l.name}: one ${pct(rs.map((r) => r.same[i]!))} / two ${pct(rs.map((r) => r.diff[i]!))}`).join("; "));
  }
  // Per range of each factor: thirds of its spread.
  for (const key of Object.keys(rows[0]!.f)) {
    const vals = rows.map((r) => r.f[key]!).sort((a, b) => a - b);
    const cuts = [vals[Math.floor(vals.length / 3)]!, vals[Math.floor((2 * vals.length) / 3)]!];
    const bins = [rows.filter((r) => r.f[key]! < cuts[0]), rows.filter((r) => r.f[key]! >= cuts[0] && r.f[key]! < cuts[1]), rows.filter((r) => r.f[key]! >= cuts[1])];
    const lab = [`<${cuts[0].toFixed(2)}`, `${cuts[0].toFixed(2)}–${cuts[1].toFixed(2)}`, `≥${cuts[1].toFixed(2)}`];
    console.log(
      `${key.padEnd(10)} ` +
        bins
          .map((b, bi) => `${lab[bi]!.padEnd(11)} angle F ${pct(b.map((r) => r.angleFront))} S ${pct(b.map((r) => r.angleSide))} | ` + LOGICS.map((_, i) => `one ${pct(b.map((r) => r.same[i]!))} two ${pct(b.map((r) => r.diff[i]!))}`).join(" ; "))
          .join("  ||  "),
    );
  }
});
