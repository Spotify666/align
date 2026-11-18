// Writes the takes the motion fit is checked on (scripts/motion/takes.ts, docs/15):
//   node scripts/motion/takes.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { createJiti } from "jiti";
const root = new URL("../../", import.meta.url).pathname;
const jiti = createJiti(import.meta.url, { alias: { "@": `${root}src` } });
const { GENERATED, generatedTake, tracedTake } = await jiti.import("./takes.ts");
const out = `${root}public/motion/takes`;
mkdirSync(out, { recursive: true });
const takes = [tracedTake(`${root}public/art/motion-ffd-side.json`), ...GENERATED.map(generatedTake)];
for (const t of takes) writeFileSync(`${out}/${t.id}.json`, JSON.stringify(t));
writeFileSync(`${out}/index.json`, JSON.stringify(takes.map((t) => ({ id: t.id, label: t.label, shot: t.shot, source: t.provenance.source, battingSide: t.battingSide })), null, 1));
console.log(takes.map((t) => `${t.id}: ${t.times.length} frames, events ${JSON.stringify(t.events)}`).join("\n"));
