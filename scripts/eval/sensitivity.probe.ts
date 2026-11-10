// Which results depend on which event? Each detected event is moved by a little (25 ms) and by
// a lot (100 ms), earlier and later, and the whole analysis is run again: every measure,
// classifier feature, verdict and other event that changes is listed against the event moved.
//   SENS_OUT=<file> [PROBE_DIR=<exported tracks>] npx vitest run --config scripts/eval/vitest.config.ts scripts/eval/sensitivity.probe.ts
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { analyze } from "@/engine/analyze";
import { evalCases } from "@/engine/eval/suite";
import { segmentEvents, type EventSet } from "@/engine/events";
import { fixture } from "@/engine/fixtures";
import { decodeTracks } from "@/engine/tracks-codec";
import type { AnalysisPayload, CaptureObservation, EventType } from "@/engine/types";

const EVENTS: EventType[] = ["trigger", "backswing_top", "bounce", "front_foot_plant", "back_foot_commit", "contact", "follow_through"];
const AT = { analysisId: "s", createdAt: "s" };

function moved(set: EventSet, type: EventType, by: number, n: number, t: number[]): EventSet {
  const e = set.byType[type];
  if (!e) return set;
  const frame = Math.max(0, Math.min(n - 1, e.frame + by));
  const next = { ...e, frame, tMs: Math.round(t[frame] ?? e.tMs) };
  return { list: set.list.map((x) => (x.type === type ? next : x)), byType: { ...set.byType, [type]: next } };
}

const val = (p: AnalysisPayload) => new Map([...p.metrics, ...(p.observations ?? [])].map((m) => [m.id, `${m.status}:${m.value}:${m.inRange}`]));

it("event sensitivity", async () => {
  const cases: Array<[string, CaptureObservation]> = [
    ["fixture valid_ffd (bat+ball)", fixture("valid_ffd")],
    ["fixture no_bat (body-led)", fixture("no_bat")],
    ["fixture front_on_ffd", fixture("front_on_ffd")],
    ...evalCases().filter((c) => /back_foot_defence_as_bfd_120_right_side_on_full|back_foot_defence_as_bfd_120_left/.test(c.id)).map((c) => [c.id, c.obs] as [string, CaptureObservation]),
  ];
  for (const dir of ["tests/assets/real", ...(process.env.PROBE_DIR ?? "").split(",").filter(Boolean)]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".b64"))) cases.push([`real ${f}`, await decodeTracks(Uint8Array.from(Buffer.from(readFileSync(`${dir}/${f}`, "utf8"), "base64")))]);
  }
  const union = new Map<EventType, { metrics: Set<string>; features: Set<string>; events: Set<string>; verdicts: Set<string>; small: Set<string> }>();
  const lines: string[] = [];
  for (const [id, obs] of cases) {
    const base = analyze(obs, AT);
    lines.push(`\n# ${id}: ${base.analysis_status}/${base.status_reason}, ${obs.body.length} frames at ${obs.media.fps} fps`);
    const fps = obs.media.fps ?? 30;
    for (const type of EVENTS) {
      if (!base.events.some((e) => e.type === type)) continue;
      const u = union.get(type) ?? { metrics: new Set(), features: new Set(), events: new Set(), verdicts: new Set(), small: new Set() };
      union.set(type, u);
      for (const ms of [-100, -25, 25, 100]) {
        const by = Math.sign(ms) * Math.max(1, Math.round((Math.abs(ms) / 1000) * fps));
        const p = analyze(obs, { ...AT, eventDetector: (o, sc) => moved(segmentEvents(o, sc), type, by, sc.n, sc.t) });
        const a = val(base);
        const b = val(p);
        const ms_ = [...new Set([...a.keys(), ...b.keys()])].filter((k) => a.get(k) !== b.get(k));
        const fa = new Map(base.features.map((f) => [f.id, f.value]));
        const fs = p.features.filter((f) => fa.get(f.id) !== f.value).map((f) => f.id);
        const ea = new Map(base.events.map((e) => [e.type, e.frame]));
        const es = p.events.filter((e) => e.type !== type && ea.get(e.type) !== e.frame).map((e) => e.type);
        const verdict = base.analysis_status !== p.analysis_status || base.status_reason !== p.status_reason ? `${base.analysis_status}/${base.status_reason} → ${p.analysis_status}/${p.status_reason}` : "";
        ms_.forEach((m) => u.metrics.add(m));
        fs.forEach((f) => u.features.add(f));
        es.forEach((e) => u.events.add(e));
        if (verdict) u.verdicts.add(`${id} (${ms} ms): ${verdict}`);
        if (Math.abs(ms) === 25) ms_.forEach((m) => u.small.add(m));
        if (ms_.length || fs.length || es.length || verdict) lines.push(`${type} ${ms > 0 ? "+" : ""}${ms} ms\tmeasures: ${ms_.join(", ") || "-"}\tfeatures: ${fs.join(", ") || "-"}\tevents: ${es.join(", ") || "-"}\t${verdict}`);
      }
    }
  }
  const head = ["event\tmeasures that change (any case, ±25 or ±100 ms)\talready at ±25 ms\tclassifier features\tother events\tverdict changes"];
  for (const [type, u] of union)
    head.push(`${type}\t${[...u.metrics].sort().join(", ") || "none"}\t${[...u.small].sort().join(", ") || "none"}\t${[...u.features].sort().join(", ") || "none"}\t${[...u.events].sort().join(", ") || "none"}\t${[...u.verdicts].join(" | ") || "none"}`);
  const text = [...head, ...lines].join("\n") + "\n";
  if (process.env.SENS_OUT) writeFileSync(process.env.SENS_OUT, text);
  else console.log(text);
});
