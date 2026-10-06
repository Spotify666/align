// node scripts/eval/overlay.mjs <video> <obs.json> <out.png> <frame,frame,...> [width]
// Draws the tracked skeleton on the real video frames (source time = sourceStartMs + t[i]).
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const sharp = createRequire(import.meta.url)("sharp");
const [, , video, obsPath, out, list, W0] = process.argv;
const obs = JSON.parse(readFileSync(obsPath, "utf8"));
const frames = list.split(",").map(Number);
const W = +(W0 ?? 240);
const J = ["nose","left_shoulder","right_shoulder","left_elbow","right_elbow","left_wrist","right_wrist","left_hip","right_hip","left_knee","right_knee","left_ankle","right_ankle","left_heel","right_heel","left_foot","right_foot"];
const ix = Object.fromEntries(J.map((j, i) => [j, i]));
const bones = [["left_shoulder","right_shoulder"],["left_shoulder","left_elbow"],["left_elbow","left_wrist"],["right_shoulder","right_elbow"],["right_elbow","right_wrist"],["left_shoulder","left_hip"],["right_shoulder","right_hip"],["left_hip","right_hip"],["left_hip","left_knee"],["left_knee","left_ankle"],["right_hip","right_knee"],["right_knee","right_ankle"],["left_ankle","left_heel"],["left_heel","left_foot"],["left_ankle","left_foot"],["right_ankle","right_heel"],["right_heel","right_foot"],["right_ankle","right_foot"]];
const front = obs.athlete.handedness === "right" ? "left" : "right";
mkdirSync("/tmp/ovl", { recursive: true });
const tiles = [];
for (const f of frames) {
  const tSec = ((obs.media.sourceStartMs ?? 0) + obs.t[f]) / 1000;
  const png = `/tmp/ovl/f${f}.png`;
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", tSec.toFixed(3), "-i", video, "-frames:v", "1", png]);
  const img = sharp(png);
  const { width, height } = await img.metadata();
  const b = obs.body[f];
  const P = (j) => (b[ix[j]] && b[ix[j]][2] >= 0.3 ? [b[ix[j]][0] * width, b[ix[j]][1] * height] : null);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`;
  for (const [a, c] of bones) { const p = P(a), q = P(c); if (p && q) svg += `<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="${a.startsWith(front) || c.startsWith(front) ? "#ff7a1f" : "#3cf"}" stroke-width="${Math.max(2, width / 250)}"/>`; }
  const n = P("nose"); if (n) svg += `<circle cx="${n[0]}" cy="${n[1]}" r="${Math.max(3, width / 120)}" fill="#ff0"/>`;
  const fa = P(`${front}_ankle`); if (fa) svg += `<line x1="${fa[0]}" y1="0" x2="${fa[0]}" y2="${height}" stroke="#ff0" stroke-dasharray="6 6" stroke-width="1.5"/>`;
  svg += `<text x="6" y="${Math.max(18, width / 25)}" font-size="${Math.max(16, width / 25)}" fill="#fff" stroke="#000" stroke-width="0.6">${f} · ${tSec.toFixed(2)}s</text></svg>`;
  const full = await img.composite([{ input: Buffer.from(svg) }]).png().toBuffer();
  const buf = await sharp(full).resize({ width: W }).png().toBuffer();
  tiles.push(buf);
}
const meta = await sharp(tiles[0]).metadata();
const cols = Math.min(tiles.length, 6), rows = Math.ceil(tiles.length / cols);
await sharp({ create: { width: cols * meta.width, height: rows * meta.height, channels: 3, background: "#000" } })
  .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * meta.width, top: Math.floor(i / cols) * meta.height })))
  .png().toFile(out);
console.log("ok", out);
