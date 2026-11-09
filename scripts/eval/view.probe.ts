// The camera-angle guess (src/lib/capture/view-guess.ts) on real batting movement from every
// camera position: international shots (KU CricShot 3D) through virtual cameras round the batter,
// read from the frames before the stroke as the capture flow reads them. Per camera position:
// how often each view is guessed, how often it is confident, the evidence's spread, and how
// often the two-angle check (`twoAngleView`) accepts it as the side or the front angle.
//   KU_DIR=/path/to/ku_cric_shot_3d npx vitest run --config scripts/eval/vitest.config.ts view --disableConsoleIntercept
import { it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { guessView, twoAngleView } from "@/lib/capture/view-guess";
import { kuObservation, readKu } from "./ku3d";

const q = (xs: number[], p: number) => {
  const v = [...xs].sort((a, b) => a - b);
  return v.length ? v[Math.floor(p * (v.length - 1))]! : NaN;
};

it("view guess round the batter", { timeout: 3_600_000 }, () => {
  const ROOT = process.env.KU_DIR ?? "";
  if (!existsSync(`${ROOT}/Defense Shot`)) return console.log("KU_DIR not set");
  const YAWS = [0, 10, -10, 20, -20, 25, -25, 30, -30, 35, -35, 40, -40, 45, -45, 60, -60, 90, -90, 180];
  type Row = { view: string; confident: boolean; ratio: number; head: number; agree: number; near: number; front: boolean; side: boolean };
  const rows = new Map<number, Row[]>();
  for (const dir of ["Defense Shot", "Drive_Shot", "Flick_Shot", "Pull_Shot"]) {
    const files = readdirSync(`${ROOT}/${dir}`).filter((x) => x.endsWith(".json")).sort();
    for (const f of files.filter((_, i) => dir === "Defense Shot" || i % 3 === 0)) {
      const s = readKu(`${ROOT}/${dir}/${f}`, f);
      if (!s) continue;
      for (const yaw of YAWS) {
        const obs = kuObservation(s, { yaw, distance: 8 });
        // Before the stroke, while the batter watches the bowler (the first 40%).
        const k = Math.max(3, Math.round(obs.body.length * 0.4));
        const frames = obs.body.slice(0, k).map((b, i) => ({ body: b, world: obs.poseWorld![i]! }));
        const g = guessView(frames as never, "right");
        if (!g) continue;
        const r: Row = {
          view: g.view,
          confident: g.confident,
          ratio: g.evidence.depthRatio,
          head: g.evidence.headFacing,
          agree: g.evidence.headAgree,
          near: g.evidence.frontNearer,
          front: twoAngleView(g, "front_on"),
          side: twoAngleView(g, "side_on"),
          ...{ headClear: g.evidence.headClear, sideClear: g.evidence.sideClear },
        };
        (rows.get(yaw) ?? rows.set(yaw, []).get(yaw)!).push(r);
      }
    }
  }
  // The relaxed front rule over a grid of limits: accepted share per camera position.
  type Ev = Row & { headClear: boolean; sideClear: boolean };
  const grid: Array<[number, number]> = [[1.3, 0.05], [1.4, 0.05], [1.5, 0.05], [1.3, 0.08], [1.4, 0.08], [1.5, 0.08]];
  console.log("grid (ratio, head):  " + YAWS.filter((y) => Math.abs(y) <= 45 || y === 180).map((y) => String(y).padStart(5)).join(""));
  for (const [R, H] of grid) {
    const cells = YAWS.filter((y) => Math.abs(y) <= 45 || y === 180).map((y) => {
      const xs = (rows.get(y) ?? []) as Ev[];
      const ok = xs.filter((r) => r.view === "front_on" && (r.confident || (r.ratio >= R && r.headClear && r.head >= H && r.sideClear && r.near > 0))).length;
      return `${Math.round((100 * ok) / Math.max(1, xs.length))}%`.padStart(5);
    });
    console.log(`  ${R.toFixed(1)}, ${H.toFixed(2)}            ${cells.join("")}`);
  }
  const pct = (xs: Row[], f: (r: Row) => boolean) => `${Math.round((100 * xs.filter(f).length) / Math.max(1, xs.length))}%`.padStart(4);
  console.log("yaw    n  front  conf-front  side  ratio p10/p50/p90   head p10/p50   2-angle front  2-angle side");
  for (const yaw of YAWS) {
    const xs = rows.get(yaw) ?? [];
    const ratio = xs.map((r) => r.ratio).filter(Number.isFinite);
    console.log(
      `${String(yaw).padStart(4)} ${String(xs.length).padStart(4)}  ${pct(xs, (r) => r.view === "front_on")}  ${pct(xs, (r) => r.view === "front_on" && r.confident)}       ${pct(xs, (r) => r.view === "side_on")}  ${[0.1, 0.5, 0.9].map((p) => q(ratio, p).toFixed(2)).join("/")}       ${[0.1, 0.5].map((p) => q(xs.map((r) => r.head), p).toFixed(3)).join("/")}       ${pct(xs, (r) => r.front)}           ${pct(xs, (r) => r.side)}`,
    );
  }
});
