#!/usr/bin/env node
// The real-media dataset on this machine. Clips are never committed: they live in eval-media/
// (ignored), named by an anonymised id made from the file's hash. The manifest
// (scripts/eval/dataset/manifest.json) holds the id, the hash and the labels, and is committed.
//
//   node scripts/eval/dataset.mjs add <video> <labels.json>   register a clip with the labels exported by label.html
//   node scripts/eval/dataset.mjs relabel <labels.json>       replace a clip's labels (bumps its revision)
//   node scripts/eval/dataset.mjs verify                      every clip present, hash unchanged, labels complete
//   node scripts/eval/dataset.mjs cases                       write eval-media/cases.json for scripts/eval/run.mjs
//   node scripts/eval/dataset.mjs id <video>                  print a file's clip id
//
// The full schema is checked by tests/dataset.test.ts on every commit.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const MANIFEST = process.env.DATASET ?? `${root}scripts/eval/dataset/manifest.json`;
const MEDIA = process.env.EVAL_MEDIA ?? `${root}eval-media`;
const EVENTS = ["trigger", "backswing_top", "bounce", "front_foot_plant", "back_foot_commit", "contact", "follow_through"];
const REQUIRED = ["athlete", "device", "view", "fps", "width", "height", "lighting", "handedness", "category", "intended", "capture", "expected", "events", "labels"];

const sha = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const idOf = (hash) => `clip_${hash.slice(0, 12)}`;
const load = () => JSON.parse(readFileSync(MANIFEST, "utf8"));
const today = () => new Date().toISOString().slice(0, 10);
const bump = (v, part) => v.split(".").map(Number).map((n, i) => (i === part ? n + 1 : i > part ? 0 : n)).join(".");
const save = (m, part) => writeFileSync(MANIFEST, JSON.stringify({ ...m, version: bump(m.version, part), updated: today(), clips: [...m.clips].sort((a, b) => a.id.localeCompare(b.id)) }, null, 2) + "\n");
const fail = (msg) => { console.error(msg); process.exit(1); };
/** The labels without the id and hash the label page adds: the manifest sets its own from the file. */
const withoutId = (l) => Object.fromEntries(Object.entries(l).filter(([k]) => k !== "sha256" && k !== "id"));

function labelsFrom(file) {
  const l = JSON.parse(readFileSync(file, "utf8"));
  const missing = REQUIRED.filter((k) => l[k] === undefined || l[k] === "");
  if (missing.length) fail(`${file}: missing ${missing.join(", ")}. Fill them in label.html and export again.`);
  if (!/^ath_[a-z0-9]{1,12}$/.test(l.athlete)) fail(`athlete must be an anonymised id like ath_01, not "${l.athlete}"`);
  return l;
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === "id") {
  console.log(idOf(sha(a)));
} else if (cmd === "add") {
  if (!a || !b) fail("usage: dataset.mjs add <video> <labels.json>");
  const hash = sha(a);
  const id = idOf(hash);
  const l = labelsFrom(b);
  if (l.sha256 && l.sha256 !== hash) fail(`These labels were made on a different file (${l.sha256.slice(0, 12)}…, this one is ${hash.slice(0, 12)}…).`);
  const m = load();
  if (m.clips.some((c) => c.id === id)) fail(`${id} is already in the dataset. Use "relabel" to change its labels.`);
  const ext = extname(a).toLowerCase();
  mkdirSync(`${MEDIA}/clips`, { recursive: true });
  copyFileSync(a, `${MEDIA}/clips/${id}${ext}`);
  const rest = withoutId(l);
  m.clips.push({ id, sha256: hash, bytes: statSync(a).size, ext, timeScale: 1, ...rest });
  save(m, 1);
  console.log(`Added ${id} (${rest.athlete}, ${rest.view}, ${rest.category}). The file was copied to eval-media/clips/ and is not committed.`);
} else if (cmd === "relabel") {
  const l = labelsFrom(a);
  const m = load();
  const i = m.clips.findIndex((c) => c.sha256 === l.sha256 || c.id === l.id);
  if (i < 0) fail("No clip in the dataset matches these labels (by hash or id).");
  const old = m.clips[i];
  const rest = withoutId(l);
  m.clips[i] = { ...old, ...rest, labels: { ...rest.labels, revision: (old.labels?.revision ?? 0) + 1 } };
  save(m, 2);
  console.log(`Relabelled ${old.id} (revision ${m.clips[i].labels.revision}).`);
} else if (cmd === "verify") {
  const m = load();
  let bad = 0;
  for (const c of m.clips) {
    const file = `${MEDIA}/clips/${c.id}${c.ext}`;
    const tracks = existsSync(`${MEDIA}/tracks/${c.id}.tracks.b64`);
    const labelled = EVENTS.filter((e) => c.events?.[e]);
    let state = "ok";
    if (!existsSync(file)) state = "FILE MISSING";
    else if (sha(file) !== c.sha256) state = "HASH CHANGED";
    if (state !== "ok") bad++;
    console.log(`${c.id}\t${state}\t${c.athlete}\t${c.view}\t${c.category}\tevents ${labelled.length}/${EVENTS.length}\ttracks ${tracks ? "exported" : "not exported"}`);
  }
  const athletes = new Set(m.clips.map((c) => c.athlete)).size;
  console.log(`\nDataset ${m.version}: ${m.clips.length} clips, ${athletes} athletes. A detector decision needs at least 10 clips from 3 athletes.`);
  process.exit(bad ? 1 : 0);
} else if (cmd === "cases") {
  const m = load();
  mkdirSync(MEDIA, { recursive: true });
  const cases = m.clips.map((c) => ({ id: c.id, file: `clips/${c.id}${c.ext}`, truth: c.category === "front_foot_defence" ? "ffd" : c.category === "none" ? "none" : "other", note: `${c.athlete} ${c.view} ${c.device}` }));
  writeFileSync(`${MEDIA}/cases.json`, JSON.stringify(cases, null, 1));
  console.log(`Wrote ${cases.length} cases to eval-media/cases.json. Export their tracks with:\n  CASES=eval-media/cases.json node scripts/eval/run.mjs <baseUrl> eval-media eval-media/tracks`);
} else {
  fail("usage: dataset.mjs add <video> <labels.json> | relabel <labels.json> | verify | cases | id <video>");
}
