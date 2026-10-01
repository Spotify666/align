// Minimal ISO-BMFF (MP4 / MOV) reader: finds the video track and returns its true
// frame rate from the sample table, so we never guess fps from playback.

export interface VideoTrackInfo {
  fps: number;
  frameCount: number;
  durationSec: number;
  width: number | null;
  height: number | null;
}

async function readRange(file: Blob, start: number, len: number): Promise<DataView> {
  const buf = await file.slice(start, start + len).arrayBuffer();
  return new DataView(buf);
}

const type = (v: DataView, o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));

/** Locate the top-level moov box without reading the whole (possibly large) file. */
async function findMoov(file: Blob): Promise<DataView | null> {
  let offset = 0;
  while (offset + 8 <= file.size) {
    const h = await readRange(file, offset, 16);
    let size = h.getUint32(0);
    const t = type(h, 4);
    let header = 8;
    if (size === 1) {
      size = Number(h.getBigUint64(8));
      header = 16;
    } else if (size === 0) size = file.size - offset;
    if (size < header) return null;
    if (t === "moov") {
      if (size > 64 * 1024 * 1024) return null;
      return readRange(file, offset, size);
    }
    offset += size;
  }
  return null;
}

function* children(v: DataView, start: number, end: number): Generator<{ t: string; s: number; e: number; body: number }> {
  let o = start;
  while (o + 8 <= end) {
    let size = v.getUint32(o);
    let header = 8;
    if (size === 1) {
      size = Number(v.getBigUint64(o + 8));
      header = 16;
    }
    if (size < header || o + size > end) return;
    yield { t: type(v, o + 4), s: o, e: o + size, body: o + header };
    o += size;
  }
}

function find(v: DataView, start: number, end: number, path: string[]): { body: number; e: number } | null {
  let range = { body: start, e: end };
  for (const name of path) {
    const next = [...children(v, range.body, range.e)].find((c) => c.t === name);
    if (!next) return null;
    range = { body: next.body, e: next.e };
  }
  return range;
}

export async function readVideoTrack(file: Blob): Promise<VideoTrackInfo | null> {
  try {
    const moov = await findMoov(file);
    if (!moov) return null;
    for (const trak of children(moov, 8, moov.byteLength)) {
      if (trak.t !== "trak") continue;
      const hdlr = find(moov, trak.body, trak.e, ["mdia", "hdlr"]);
      if (!hdlr || type(moov, hdlr.body + 8) !== "vide") continue;
      const mdhd = find(moov, trak.body, trak.e, ["mdia", "mdhd"]);
      const stts = find(moov, trak.body, trak.e, ["mdia", "minf", "stbl", "stts"]);
      if (!mdhd || !stts) continue;
      const version = moov.getUint8(mdhd.body);
      const timescale = version === 1 ? moov.getUint32(mdhd.body + 20) : moov.getUint32(mdhd.body + 12);
      const duration = version === 1 ? Number(moov.getBigUint64(mdhd.body + 24)) : moov.getUint32(mdhd.body + 16);
      const entries = moov.getUint32(stts.body + 4);
      let frames = 0;
      let ticks = 0;
      for (let i = 0; i < entries; i++) {
        const count = moov.getUint32(stts.body + 8 + i * 8);
        const delta = moov.getUint32(stts.body + 12 + i * 8);
        frames += count;
        ticks += count * delta;
      }
      const durationSec = (ticks || duration) / timescale;
      const tkhd = find(moov, trak.body, trak.e, ["tkhd"]);
      let width: number | null = null;
      let height: number | null = null;
      if (tkhd) {
        const tv = moov.getUint8(tkhd.body);
        const wOff = tkhd.body + (tv === 1 ? 88 : 76);
        width = moov.getUint32(wOff) >> 16;
        height = moov.getUint32(wOff + 4) >> 16;
      }
      if (!frames || !durationSec) continue;
      return { fps: frames / durationSec, frameCount: frames, durationSec, width, height };
    }
    return null;
  } catch {
    return null;
  }
}
