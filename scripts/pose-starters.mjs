// Prints the starting poses of a new shot model (see src/lib/pose-starters.ts):
//   node scripts/pose-starters.mjs > src/lib/pose-starters.json
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { alias: { "@": new URL("../src", import.meta.url).pathname } });
const { computeStarters } = await jiti.import("../src/lib/pose-starters.ts");
console.log(JSON.stringify(computeStarters()));
