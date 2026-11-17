// Prints the starting poses of a new shot model (see src/lib/pose-starters.ts), from the traced figures:
//   node scripts/pose-starters.mjs > src/lib/pose-starters.json
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { alias: { "@": new URL("../src", import.meta.url).pathname } });
const { startersFrom } = await jiti.import("../src/lib/pose-starters.ts");
const read = (f) => JSON.parse(readFileSync(new URL(`../public/art/${f}`, import.meta.url), "utf8"));
console.log(JSON.stringify(startersFrom({ front_foot_defence: read("model-ffd-side.json"), back_foot_defence: read("model-bfd-side.json") }, { front_foot_defence: read("model-bfd-front.json"), back_foot_defence: read("model-bfd-front.json") })));
