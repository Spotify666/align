// How checking a shot without choosing it compares with asking for each shot, on generated
// movement: the evaluation set and the population. UNCHOSEN_OUT=<file> writes the table.
import { test } from "vitest";
import { writeFileSync } from "node:fs";
import { analyze } from "@/engine/analyze";
import { analyzeUnchosen, askedAs } from "@/engine/identify";
import { population } from "@/engine/fixtures/population";
import { evalCases } from "@/engine/eval/suite";

const opts = { analysisId: "u", createdAt: "2026-10-01T00:00:00.000Z" };

test("unchosen against asked", { timeout: 600000 }, () => {
  const rows = new Map<string, { n: number; front: number; back: number; un: number; handed: number }>();
  const add = (family: string, obs: Parameters<typeof analyze>[0]) => {
    const front = analyze(askedAs(obs, "front_foot_defence"), opts).analysis_status === "valid";
    const back = analyze(askedAs(obs, "back_foot_defence"), opts).analysis_status === "valid";
    const un = analyzeUnchosen(obs, opts);
    const r = rows.get(family) ?? { n: 0, front: 0, back: 0, un: 0, handed: 0 };
    r.n++;
    r.front += Number(front);
    r.back += Number(back);
    r.un += Number(un.payload.analysis_status === "valid");
    r.handed += Number(un.handedOff);
    rows.set(family, r);
  };
  const seen = new Set<string>();
  for (const c of evalCases()) {
    // Each movement once (the set holds it asked as both shots).
    const key = JSON.stringify({ ...c.options, id: undefined, target: undefined });
    if (seen.has(key)) continue;
    seen.add(key);
    add(`set · ${(c.slices.find((s) => s.startsWith("family:")) ?? "family:?").slice(7)}`, c.obs);
  }
  for (const c of population(420, 11)) add(`population · ${c.family}`, c.obs);
  const out = ["movement | cases | accepted asked front-foot | accepted asked back-foot | accepted unchosen | handed off", ...[...rows].map(([k, r]) => `${k} | ${r.n} | ${r.front} | ${r.back} | ${r.un} | ${r.handed}`)].join("\n");
  if (process.env.UNCHOSEN_OUT) writeFileSync(process.env.UNCHOSEN_OUT, out + "\n");
});
