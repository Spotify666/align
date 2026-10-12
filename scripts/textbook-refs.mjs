// Prints the textbook model's shot signatures (see src/lib/textbook-refs.ts):
//   node scripts/textbook-refs.mjs > src/lib/textbook-refs.json
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { alias: { "@": new URL("../src", import.meta.url).pathname } });
const { computeTextbookSignatures } = await jiti.import("../src/lib/textbook-refs.ts");
console.log(JSON.stringify(computeTextbookSignatures()));
