// align-tracks-v1: compact binary encoding of a CaptureObservation.
// Positions are quantised to 16 bits and confidences to 8 bits, then gzipped.
// A 2 s, 120 fps clip is ~15–25 KB instead of ~400 KB of JSON. The engine always
// analyses the *decoded* observation, so stored tracks reproduce the report exactly.

import type { CameraPoint, CaptureObservation, ImgPoint, WorldPoint } from "./types";

const MAGIC = 0x414c4731; // "ALG1"
const POS_LO = -0.5;
const POS_SPAN = 2; // normalised image coords in [-0.5, 1.5]
const WORLD_MM = 1000;

type Header = Omit<CaptureObservation, "t" | "body" | "body3d" | "vizDepth" | "poseWorld" | "bat" | "ball"> & {
  frames: number;
  joints: number;
  has3d: boolean;
  /** Optional trailing sections (older files simply end before them). */
  hasPoseWorld?: boolean;
  hasVizDepth: boolean;
  batSource: CaptureObservation["bat"]["source"];
  ballSource: CaptureObservation["ball"]["source"];
};

const qPos = (v: number) => Math.max(0, Math.min(65535, Math.round(((v - POS_LO) / POS_SPAN) * 65535)));
const dqPos = (q: number) => POS_LO + (q / 65535) * POS_SPAN;
// 0 encodes "not observed"; real confidences use 1..255.
const qConf = (c: number) => 1 + Math.max(0, Math.min(254, Math.round(c * 254)));
const dqConf = (q: number) => (q - 1) / 254;

function writePoints(points: ImgPoint[], pos: Uint16Array, conf: Uint8Array, offset: number) {
  points.forEach((p, i) => {
    if (!p) return;
    pos[(offset + i) * 2] = qPos(p[0]);
    pos[(offset + i) * 2 + 1] = qPos(p[1]);
    conf[offset + i] = qConf(p[2]);
  });
}

function readPoints(count: number, pos: Uint16Array, conf: Uint8Array, offset: number): ImgPoint[] {
  return Array.from({ length: count }, (_, i) => {
    const c = conf[offset + i]!;
    if (c === 0) return null;
    return [dqPos(pos[(offset + i) * 2]!), dqPos(pos[(offset + i) * 2 + 1]!), dqConf(c)] as const;
  });
}

export function encodeRaw(obs: CaptureObservation): Uint8Array {
  const frames = obs.body.length;
  const joints = obs.body[0]?.length ?? 0;
  const { t, body, body3d, vizDepth, poseWorld, bat, ball, ...rest } = obs;
  const header: Header = { ...rest, frames, joints, has3d: !!body3d, hasVizDepth: !!vizDepth, hasPoseWorld: !!poseWorld, batSource: bat.source, ballSource: ball.source };
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));

  const pointCount = frames * joints + frames * 3; // body + handle + toe + ball
  const pos = new Uint16Array(pointCount * 2);
  const conf = new Uint8Array(pointCount);
  body.forEach((f, i) => writePoints(f, pos, conf, i * joints));
  writePoints(bat.handle, pos, conf, frames * joints);
  writePoints(bat.toe, pos, conf, frames * joints + frames);
  writePoints(ball.points, pos, conf, frames * joints + 2 * frames);

  const times = new Float32Array(t);
  const packXyz = (src: ReadonlyArray<ReadonlyArray<WorldPoint | CameraPoint>> | undefined) => {
    const xyz = new Int16Array(src ? frames * joints * 3 : 0);
    const c = new Uint8Array(src ? frames * joints : 0);
    src?.forEach((f, i) =>
      f.forEach((p, j) => {
        if (!p) return;
        const k = i * joints + j;
        for (let a = 0; a < 3; a++) xyz[k * 3 + a] = Math.max(-32767, Math.min(32767, Math.round(p[a]! * WORLD_MM)));
        c[k] = qConf(p[3]);
      }),
    );
    return [xyz, c] as const;
  };
  const [world, worldConf] = packXyz(body3d);
  const [pw, pwConf] = packXyz(poseWorld);

  const depth = new Int16Array(vizDepth ? frames * joints : 0);
  vizDepth?.forEach((f, i) => f.forEach((d, j) => (depth[i * joints + j] = Math.max(-32767, Math.min(32767, Math.round(d * WORLD_MM))))));

  const sections = [new Uint8Array(times.buffer), new Uint8Array(pos.buffer), conf, new Uint8Array(world.buffer), worldConf, new Uint8Array(depth.buffer)];
  if (poseWorld) sections.push(new Uint8Array(pw.buffer), pwConf);
  const total = 12 + headerBytes.length + sections.reduce((s, b) => s + 4 + b.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, MAGIC);
  view.setUint32(4, 1);
  view.setUint32(8, headerBytes.length);
  out.set(headerBytes, 12);
  let o = 12 + headerBytes.length;
  for (const s of sections) {
    view.setUint32(o, s.length);
    out.set(s, o + 4);
    o += 4 + s.length;
  }
  return out;
}

export function decodeRaw(bytes: Uint8Array): CaptureObservation {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0) !== MAGIC) throw new Error("Not an align-tracks file");
  if (view.getUint32(4) !== 1) throw new Error("Unsupported align-tracks version");
  const hLen = view.getUint32(8);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + hLen))) as Header;
  let o = 12 + hLen;
  const next = () => {
    const len = view.getUint32(o);
    const slice = bytes.slice(o + 4, o + 4 + len);
    o += 4 + len;
    return slice;
  };
  const times = new Float32Array(next().buffer);
  const pos = new Uint16Array(next().buffer);
  const conf = next();
  const world = new Int16Array(next().buffer);
  const worldConf = next();
  const depth = new Int16Array(next().buffer);
  const { frames, joints, has3d, hasVizDepth, hasPoseWorld, batSource, ballSource, ...rest } = header;
  const pw = hasPoseWorld ? new Int16Array(next().buffer) : null;
  const pwConf = hasPoseWorld ? next() : null;

  const body = Array.from({ length: frames }, (_, i) => readPoints(joints, pos, conf, i * joints));
  const unpackXyz = (xyz: Int16Array, c: Uint8Array) =>
    Array.from({ length: frames }, (_, i) =>
      Array.from({ length: joints }, (_, j) => {
        const k = i * joints + j;
        const q = c[k]!;
        if (q === 0) return null;
        return [xyz[k * 3]! / WORLD_MM, xyz[k * 3 + 1]! / WORLD_MM, xyz[k * 3 + 2]! / WORLD_MM, dqConf(q)] as const;
      }),
    );
  const body3d: WorldPoint[][] | undefined = has3d ? unpackXyz(world, worldConf) : undefined;
  const poseWorld: CameraPoint[][] | undefined = pw && pwConf ? unpackXyz(pw, pwConf) : undefined;

  return {
    ...rest,
    t: Array.from(times, (x) => Math.round(x * 100) / 100),
    body,
    body3d,
    vizDepth: hasVizDepth ? Array.from({ length: frames }, (_, i) => Array.from({ length: joints }, (_, j) => depth[i * joints + j]! / WORLD_MM)) : undefined,
    ...(poseWorld ? { poseWorld } : {}),
    bat: {
      source: batSource,
      handle: readPoints(frames, pos, conf, frames * joints),
      toe: readPoints(frames, pos, conf, frames * joints + frames),
    },
    ball: { source: ballSource, points: readPoints(frames, pos, conf, frames * joints + 2 * frames) },
  };
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export const encodeTracks = (obs: CaptureObservation) => pipe(encodeRaw(obs), new CompressionStream("gzip"));
export const decodeTracks = async (gz: Uint8Array) => decodeRaw(await pipe(gz, new DecompressionStream("gzip")));

/** Quantise an observation exactly as storage will, so analysis is reproducible from stored tracks. */
export const quantise = (obs: CaptureObservation) => decodeRaw(encodeRaw(obs));
