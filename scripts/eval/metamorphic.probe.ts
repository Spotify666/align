// Slice report of the metamorphic relations over the synthetic set: for every case and every
// transform, does the result on the transformed copy agree with the original?
//   METAMORPHIC_OUT=<file> npx vitest run --config scripts/eval/vitest.config.ts scripts/eval/metamorphic.probe.ts
// Synthetic movement only: it shows the engine treats two recordings of one movement alike. It
// says nothing about accuracy on real athletes.
import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { evalCases, RELATIONS } from "@/engine/eval/suite";
import { differences, signature } from "@/engine/eval/relations";

it("metamorphic slices", () => {
  const cases = evalCases();
  const lines: string[] = [];
  const tally = new Map<string, { ok: number; n: number }>();
  const bySlice = new Map<string, { ok: number; n: number }>();
  const bump = (m: Map<string, { ok: number; n: number }>, k: string, ok: boolean) => {
    const v = m.get(k) ?? { ok: 0, n: 0 };
    v.n++;
    if (ok) v.ok++;
    m.set(k, v);
  };
  for (const c of cases) {
    const base = signature(c.obs);
    for (const r of RELATIONS) {
      if (r.applies && !r.applies(c)) continue;
      const diffs = differences(base, signature(r.transform(c.obs)), r.relation(c));
      const ok = diffs.length === 0;
      bump(tally, r.id, ok);
      for (const s of c.slices) bump(bySlice, `${s} · ${r.id}`, ok);
      if (!ok) lines.push(`${c.id}\t${r.id}\t${diffs.slice(0, 4).map((d) => `${d.what}: ${JSON.stringify(d.a)} → ${JSON.stringify(d.b)}`).join("; ")}${diffs.length > 4 ? ` (+${diffs.length - 4})` : ""}`);
    }
  }
  const head = [`cases ${cases.length}`, "", "relation\tholds", ...[...tally].map(([k, v]) => `${k}\t${v.ok}/${v.n}`), "", "slice · relation\tholds", ...[...bySlice].filter(([, v]) => v.ok < v.n).map(([k, v]) => `${k}\t${v.ok}/${v.n}`), "", "broken"];
  const text = [...head, ...lines].join("\n") + "\n";
  if (process.env.METAMORPHIC_OUT) writeFileSync(process.env.METAMORPHIC_OUT, text);
  else console.log(text);
});
