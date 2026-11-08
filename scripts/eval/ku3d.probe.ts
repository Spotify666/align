// Real batting motion through the engine from every camera position (see ku3d.ts).
//   KU_DIR=/path/to/ku_cric_shot_3d npx vitest run --config scripts/eval/vitest.config.ts ku3d --disableConsoleIntercept
// Options: KU_LIMIT (shots per class), KU_VIEWS (comma-separated yaws), KU_OUT (JSON of every result).
import { it } from "vitest";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { analyze } from "@/engine/analyze";
import type { TargetShot } from "@/engine/types";
import { defenceKind, footwork, kuObservation, readKu, type KuShot } from "./ku3d";

const DIR = process.env.KU_DIR ?? "";
const LIMIT = Number(process.env.KU_LIMIT ?? 1e9);
const VIEWS = (process.env.KU_VIEWS ?? "0,90,-90,180,45,-45").split(",").map(Number);
const CLASSES: Array<[string, string]> = [
  ["Defense Shot", "defence"],
  ["Pull_Shot", "pull"],
  ["Drive_Shot", "drive"],
  ["Flick_Shot", "flick"],
];

it("ku3d through the engine", { timeout: 3_600_000 }, () => {
  if (!existsSync(DIR)) return console.log("KU_DIR not set");
  const out: Array<Record<string, unknown>> = [];
  const tally = new Map<string, Map<string, number>>();
  const add = (group: string, key: string) => {
    const g = tally.get(group) ?? new Map<string, number>();
    g.set(key, (g.get(key) ?? 0) + 1);
    tally.set(group, g);
  };
  for (const [folder, cls] of CLASSES) {
    const files = readdirSync(`${DIR}/${folder}`).filter((f) => f.endsWith(".json")).sort().slice(0, LIMIT);
    for (const f of files) {
      const s: KuShot | null = readKu(`${DIR}/${folder}/${f}`, `${cls}:${f.slice(0, 3)}`);
      if (!s) continue;
      const kind = cls === "defence" ? defenceKind(s) : cls;
      const truth = cls === "defence" ? (kind === "front" ? "ffd" : kind === "back" ? "bfd" : "defence?") : cls;
      for (const yaw of VIEWS) {
        for (const target of ["front_foot_defence", "back_foot_defence"] as TargetShot[]) {
          const obs = kuObservation(s, { yaw, distance: 8 }, { target });
          const p = analyze(obs, { analysisId: obs.id, createdAt: "2026-01-01T00:00:00.000Z" });
          const named = p.observed_shot?.label ?? "-";
          const verdict = p.analysis_status === "valid" ? "VALID" : p.analysis_status === "invalid_for_requested_analysis" ? `other:${named}` : `${p.analysis_status}:${p.status_reason}`;
          add(`${truth} ${target === "back_foot_defence" ? "BFD" : "FFD"} ${obs.camera.view}`, verdict);
          out.push({ id: s.id, truth, yaw, view: obs.camera.view, target, status: p.analysis_status, reason: p.status_reason, named, headline: p.headline, fw: footwork(s) });
        }
      }
    }
  }
  for (const [g, m] of [...tally.entries()].sort()) {
    const total = [...m.values()].reduce((x, y) => x + y, 0);
    console.log(`${g.padEnd(34)} n=${String(total).padStart(4)} :: ${[...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  }
  if (process.env.KU_OUT) writeFileSync(process.env.KU_OUT, JSON.stringify(out));
});
