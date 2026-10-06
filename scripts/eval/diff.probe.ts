// Where two exported tracks differ: frames and joints (BEFORE / AFTER files).
import { it } from "vitest";
import { readFileSync } from "node:fs";
import { decodeTracks } from "@/engine/tracks-codec";
import { JOINTS } from "@/engine/types";

it("diff two tracks", async () => {
  const [a, b] = (await Promise.all([process.env.A!, process.env.B!].map((f) => decodeTracks(Uint8Array.from(Buffer.from(readFileSync(f, "utf8"), "base64")))))) as [Awaited<ReturnType<typeof decodeTracks>>, Awaited<ReturnType<typeof decodeTracks>>];
  console.log("t equal", JSON.stringify(a.t) === JSON.stringify(b.t), a.t.slice(0, 3), b.t.slice(0, 3));
  const rows: string[] = [];
  a.body.forEach((fr, i) => fr.forEach((p, j) => {
    const q = b.body[i]?.[j];
    const d = p && q ? Math.max(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1])) : p || q ? 9 : 0;
    if (d > 0.002) rows.push(`f${i} ${JOINTS[j]} d=${d.toFixed(3)} conf ${p?.[2]?.toFixed(2)} / ${q?.[2]?.toFixed(2)}`);
  }));
  console.log(rows.length, "joint readings differ");
  console.log(rows.slice(0, 25).join("\n"));
});
