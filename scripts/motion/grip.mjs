// How a generated batter holds the bat, frame by frame (src/engine/fixtures/generate.ts):
//   node scripts/motion/grip.mjs [fixture key] [every n frames]
// Each elbow's bend, how far each hand falls short of its grip on the handle (cm), the arm's bone
// lengths, the hands' order on the handle, and the blade's clearance from the front pad (cm), from
// the generator's own truth (no tracker noise). The worst of each over the take at the end.
import { createJiti } from "jiti";
const root = new URL("../../", import.meta.url).pathname;
const jiti = createJiti(import.meta.url, { alias: { "@": `${root}src` } });
const { FIXTURE_SPECS } = await jiti.import("../../src/engine/fixtures/index.ts");
const { gripReport } = await jiti.import("../../src/engine/fixtures/grip-report.ts");

const key = process.argv[2] ?? "valid_ffd";
const every = Number(process.argv[3] ?? 6);
const spec = FIXTURE_SPECS.find((s) => s.key === key);
if (!spec) throw new Error(`no fixture ${key}`);
const r = gripReport({ ...spec.options, handedness: "right" });
const f1 = (x) => x.toFixed(1);
console.log("frame  t     lead bend  rear bend  lead short  rear short  order  pad clearance");
for (const row of r.frames.filter((_, i) => i % every === 0)) {
  console.log(`${String(row.frame).padStart(5)} ${row.t.toFixed(2)}  ${f1(row.leadBend).padStart(8)}°  ${f1(row.rearBend).padStart(8)}°  ${f1(row.leadShortCm).padStart(8)}  ${f1(row.rearShortCm).padStart(9)}  ${row.ordered ? "  top " : " SWAP "} ${f1(row.padClearCm).padStart(8)}`);
}
console.log("\nworst:", JSON.stringify(r.worst));
