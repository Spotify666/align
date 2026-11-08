// The back-foot formula's signals on real movement: KU CricShot 3D shots from every camera
// position (KU_DIR) and exported phone tracks (TRACKS=a.b64,b.b64; HAND_<id>=right to correct
// a track's batting hand). Prints each signal's spread per shot class and view, so every
// threshold can be set from real data with a margin.
//   KU_DIR=… TRACKS=… npx vitest run --config scripts/eval/vitest.config.ts formula --disableConsoleIntercept
import { it } from "vitest";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { buildScene } from "@/engine/scene";
import { backFootFormula } from "@/engine/backfoot-formula";
import { decodeTracks } from "@/engine/tracks-codec";
import { segmentEvents } from "@/engine/events";
import { defenceKind, kuObservation, readKu } from "./ku3d";

const DIR = process.env.KU_DIR ?? "";
const LIMIT = Number(process.env.KU_LIMIT ?? 1e9);
const VIEWS = (process.env.KU_VIEWS ?? "0,90,-90,180,45").split(",").map(Number);
const KEYS = (process.env.KEYS ?? "stanceEnd,set,gapRef,closed,hipsBack,backStep,feetAway,hipDrop,headDrop,handsHigh,handsSweep,turn,follow").split(",");
const q = (xs: number[], p: number) => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return v.length ? v[Math.min(v.length - 1, Math.floor(p * v.length))]! : NaN;
};
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2).padStart(5) : "   - ");

it("formula signals", { timeout: 3_600_000 }, async () => {
  const groups = new Map<string, Array<Record<string, number>>>();
  const matches = new Map<string, number[]>();
  const dump: Array<Record<string, unknown>> = [];
  const add = (g: string, s: Record<string, number>, m: boolean) => {
    dump.push({ g, ...s, match: m });
    (groups.get(g) ?? groups.set(g, []).get(g)!).push(s);
    const c = matches.get(g) ?? [0, 0];
    c[0]! += m ? 1 : 0;
    c[1]! += 1;
    matches.set(g, c);
  };
  if (existsSync(DIR))
    for (const [folder, cls] of [["Defense Shot", "defence"], ["Pull_Shot", "pull"], ["Drive_Shot", "drive"], ["Flick_Shot", "flick"]] as const) {
      for (const f of readdirSync(`${DIR}/${folder}`).filter((x) => x.endsWith(".json")).sort().slice(0, LIMIT)) {
        const s = readKu(`${DIR}/${folder}/${f}`, f);
        if (!s) continue;
        const truth = cls === "defence" ? ({ front: "ffd", back: "bfd", unclear: "def?" } as const)[defenceKind(s)] : cls;
        for (const yaw of VIEWS) {
          const obs = kuObservation(s, { yaw, distance: 8 });
          const scene = buildScene(obs);
          const frac = process.env.KU_REF_FRAC ? Number(process.env.KU_REF_FRAC) : null;
          const r = backFootFormula(scene, frac === null ? null : Math.round(frac * (scene.n - 1)), { view: obs.camera.view });
          if (r) add(`${truth.padEnd(5)} ${scene.plane === "frontal" ? "end " : "side"} ${String(yaw).padStart(4)}`, r.signals, r.match);
        }
      }
    }
  for (const file of (process.env.TRACKS ?? "").split(",").filter(Boolean)) {
    const obs0 = await decodeTracks(Uint8Array.from(Buffer.from(readFileSync(file, "utf8"), "base64")));
    const id = file.split("/").pop()!.replace(".tracks.b64", "");
    const hand = process.env[`HAND_${id}`] as "right" | "left" | undefined;
    const obs = hand ? { ...obs0, athlete: { ...obs0.athlete, handedness: hand } } : obs0;
    const scene = buildScene(obs);
    const ev = segmentEvents(obs, scene);
    const r = backFootFormula(scene, null, { view: obs.camera.view });
    if (!r) continue;
    console.log(`\n${id} (${obs.camera.view}, ${obs.athlete.handedness}) ref ${r.reference} @${Math.round(scene.t[r.reference] ?? 0)}ms (${r.referenceKind}, stance to ${r.signals.stanceEnd}, peak ${r.signals.peak}) (events contact ${ev.byType.contact?.frame}) match=${r.match} front=${r.frontStride} attacking=${r.attacking}`);
    console.log("   " + KEYS.map((k) => `${k} ${f2(r.signals[k]!)}`).join(" "));
    for (const c of r.checks) console.log(`   ${c.id.padEnd(12)} ${String(c.pass).padEnd(5)} ${c.value === null ? "-" : c.value.toFixed(3)} :: ${c.reading}`);
  }
  if (process.env.SIGNALS_OUT) writeFileSync(process.env.SIGNALS_OUT, JSON.stringify(dump));
  if (groups.size) {
    console.log(`\n${"group".padEnd(16)} n   match | ${KEYS.map((k) => k.padStart(17)).join("")}`);
    console.log(`${"".padEnd(28)}| ${KEYS.map(() => "   p5  p50  p95".padStart(17)).join("")}`);
    for (const [g, rows] of [...groups.entries()].sort()) {
      const [m, n] = matches.get(g)!;
      console.log(`${g.padEnd(16)} ${String(n).padStart(3)} ${String(m).padStart(4)}  | ${KEYS.map((k) => {
        const v = rows.map((r) => r[k]!);
        return ` ${f2(q(v, 0.05))}${f2(q(v, 0.5))}${f2(q(v, 0.95))}`;
      }).join("")}`);
    }
  }
});
