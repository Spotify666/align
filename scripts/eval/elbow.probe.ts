// The front elbow on real movement from every camera position: at the back-foot defence's set,
// how short the forearm looks against its own clear length, where the elbow is graded and how
// often it is left ungraded (bfd.elbow.* in the registry). International back-foot defences
// (KU CricShot 3D) through virtual cameras round the batter:
//   KU_DIR=/path/to/ku_cric_shot_3d npx vitest run --config scripts/eval/vitest.config.ts elbow --disableConsoleIntercept
import { it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { analyze } from "@/engine/analyze";
import { buildScene } from "@/engine/scene";
import { defenceKind, kuObservation, readKu } from "./ku3d";

it("ku forearm at the set", { timeout: 3_600_000 }, () => {
  const DIR = `${process.env.KU_DIR ?? ""}/Defense Shot`;
  if (!existsSync(DIR)) return console.log("KU_DIR not set");
  const byView = new Map<number, number[]>();
  const elbows = new Map<number, number[]>();
  const unseen = new Map<number, number[]>();
  for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json")).sort()) {
    const s = readKu(`${DIR}/${f}`, f);
    if (!s || defenceKind(s) !== "back") continue;
    for (const yaw of [0, 90, -90, 180, 45, -45]) {
      const obs = { ...kuObservation(s, { yaw, distance: 8 }, { target: "back_foot_defence" }) };
      const p = analyze(obs, { analysisId: "k", createdAt: "2026-01-01T00:00:00.000Z" });
      const ref = p.back_foot?.referenceFrame;
      if (ref === undefined) continue;
      const sc = buildScene(obs);
      const all: number[] = [];
      for (let i = 0; i < sc.n; i++) {
        const e = sc.inPicture(i, "front_elbow"), w = sc.inPicture(i, "front_wrist");
        if (e && w) all.push(Math.hypot(e[0] - w[0], e[1] - w[1]) / sc.stature);
      }
      all.sort((a, b) => a - b);
      const own = all[Math.floor(0.9 * (all.length - 1))]!;
      const fl: number[] = [];
      for (const i of [ref - 1, ref, ref + 1]) {
        const e = sc.inPicture(i, "front_elbow"), w = sc.inPicture(i, "front_wrist");
        if (e && w) fl.push(Math.hypot(e[0] - w[0], e[1] - w[1]) / sc.stature);
      }
      fl.sort((a, b) => a - b);
      if (fl.length) (byView.get(yaw) ?? byView.set(yaw, []).get(yaw)!).push(fl[Math.floor(fl.length / 2)]! / own);
      const m = p.metrics.find((x) => x.id === "bfd_elbow");
      if (m?.value != null) (elbows.get(yaw) ?? elbows.set(yaw, []).get(yaw)!).push(m.value);
      else (unseen.get(yaw) ?? unseen.set(yaw, []).get(yaw)!).push(1);
    }
  }
  const q = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.floor(p * (xs.length - 1))]!;
  for (const [yaw, xs] of byView) {
    const el = elbows.get(yaw) ?? [];
    console.log(`yaw ${String(yaw).padStart(4)}: n=${xs.length} ratio p5=${q(xs, 0.05).toFixed(2)} p10=${q(xs, 0.1).toFixed(2)} median=${q(xs, 0.5).toFixed(2)} <0.5: ${xs.filter((x) => x < 0.5).length} <0.4: ${xs.filter((x) => x < 0.4).length} <0.3: ${xs.filter((x) => x < 0.3).length} | elbow p10=${el.length ? q(el, 0.1).toFixed(3) : "-"} median=${el.length ? q(el, 0.5).toFixed(3) : "-"} p90=${el.length ? q(el, 0.9).toFixed(3) : "-"} >0.04: ${el.filter((x) => x > 0.04).length}/${el.length} not seen: ${(unseen.get(yaw) ?? []).length}`);
  }
});
