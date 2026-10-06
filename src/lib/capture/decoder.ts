"use client";
// Exact, repeatable frames from an MP4 / MOV (what phones record), decoded directly with
// the browser's video decoder. Playing a clip and taking whatever frames the screen shows
// depends on how busy the device is, so the same video could give different frames, and
// so different shots and verdicts, from run to run. Seeking re-decodes from the previous
// keyframe every time. Here each needed frame is decoded once, in order, and the same
// frames come back every time.

import { createFile, DataStream, Endianness, MP4BoxBuffer, type Sample } from "mp4box";
import { makeCanvas, type AnyCanvas } from "./canvas";

export interface DecodedVideo {
  width: number;
  height: number;
  fps: number;
  /** Start time (s) of every frame in display order, on the video element's timeline. */
  times: number[];
  /**
   * Deliver the frame that is on screen at each target time (ascending), in order. The
   * canvas holds that frame, upright, at display size, until the callback returns.
   * Returning false stops early. Resolves to the targets that were not delivered.
   */
  read(
    targets: number[],
    onFrame: (index: number, frame: AnyCanvas, time: number) => boolean | void | Promise<boolean | void>,
    stop?: () => boolean,
    /**
     * wait: onFrame may return a promise; each frame is painted only after the previous
     * frame's onFrame has settled (decoding is held back meanwhile), so a slow consumer can
     * work on the canvas across awaits. The pixels are the same either way.
     */
    opts?: { wait?: boolean },
  ): Promise<number[]>;
  close(): void;
}

const CHUNK = 4 * 1024 * 1024;

interface Frame {
  t: number; // start time, s
  decode: number; // index in decode order
}

/** Open a clip for exact decoding, or null when this browser or file can't (callers fall back to playback). Works in a worker too. */
export async function openDecoded(file: Blob): Promise<DecodedVideo | null> {
  if (typeof VideoDecoder === "undefined") return null;
  try {
    const mp4 = createFile();
    let info: Awaited<ReturnType<NonNullable<typeof mp4.onReady>>> | null = null;
    let failed = false;
    mp4.onReady = (i) => (info = i as never);
    mp4.onError = () => (failed = true);
    let pos = 0;
    // Feed until the movie header is parsed (mp4box skips media data it doesn't need).
    while (!info && !failed && pos < file.size) {
      const buf = await file.slice(pos, Math.min(file.size, pos + CHUNK)).arrayBuffer();
      const next = mp4.appendBuffer(MP4BoxBuffer.fromArrayBuffer(buf, pos), pos + buf.byteLength >= file.size);
      pos = next > pos ? next : pos + buf.byteLength;
    }
    const movie = info as { videoTracks: Array<{ id: number; codec: string; timescale: number; matrix: ArrayLike<number>; edits?: Array<{ media_time: number; segment_duration: number }>; movie_timescale: number; video?: { width: number; height: number } }> } | null;
    const track = movie?.videoTracks[0];
    if (!track) return null;
    const trak = mp4.getTrackById(track.id) as unknown as {
      samples: Sample[];
      mdia: { minf: { stbl: { stsd: { entries: Array<Record<string, { write: (s: DataStream) => void } | undefined>> } } } };
    };
    const samples = trak.samples;
    if (!samples?.length) return null;

    // Decoder setup: the codec's configuration record, without its box header.
    const entry = trak.mdia.minf.stbl.stsd.entries[0]!;
    const box = entry.avcC ?? entry.hvcC ?? entry.vpcC ?? entry.av1C;
    let description: Uint8Array | undefined;
    if (box) {
      const s = new DataStream(undefined, 0, Endianness.BIG_ENDIAN);
      box.write(s);
      description = new Uint8Array(s.buffer, 8);
    }
    const config: VideoDecoderConfig = {
      codec: track.codec.startsWith("vp08") ? "vp8" : track.codec,
      codedWidth: track.video?.width,
      codedHeight: track.video?.height,
      ...(description ? { description } : {}),
    };
    if (!(await VideoDecoder.isConfigSupported(config)).supported) return null;

    // The player's timeline starts where the first edit starts in the media (B-frame delay).
    const edits = track.edits ?? [];
    let shift = 0;
    for (const e of edits) {
      if (e.media_time === -1) shift -= e.segment_duration / track.movie_timescale;
      else {
        shift += e.media_time / track.timescale;
        break;
      }
    }
    const ts = track.timescale;
    const order = samples.map((s, d) => ({ t: s.cts / ts - shift, decode: d })).sort((a, b) => a.t - b.t);
    const frames: Frame[] = order;
    const times = frames.map((f) => f.t);
    const fps = frames.length > 1 ? (frames.length - 1) / (times[times.length - 1]! - times[0]!) : 30;

    // Upright, display-size frames: phones store portrait video rotated, with a matrix.
    const m = track.matrix;
    const rot = ((Math.round((Math.atan2(m[1]! / 65536, m[0]! / 65536) * 180) / Math.PI / 90) * 90) % 360 + 360) % 360;
    const cw = track.video?.width ?? 0;
    const ch = track.video?.height ?? 0;
    const width = rot === 90 || rot === 270 ? ch : cw;
    const height = rot === 90 || rot === 270 ? cw : ch;
    // A page canvas on the page (as always), an offscreen one in a worker.
    const canvas = makeCanvas(width, height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;

    const syncBefore = (d: number) => {
      for (let k = d; k >= 0; k--) if (samples[k]!.is_sync) return k;
      return 0;
    };
    const frameAt = (t: number) => {
      // The frame on screen at t: the last one starting at or before it.
      let lo = 0;
      let hi = times.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (times[mid]! <= t + 1e-6) lo = mid;
        else hi = mid - 1;
      }
      return lo;
    };

    const read: DecodedVideo["read"] = async (targets, onFrame, stop, opts) => {
      const wait = !!opts?.wait;
      if (!targets.length) return [];
      const want = targets.map(frameAt);
      // Which targets each display frame serves.
      const serves = new Map<number, number[]>();
      want.forEach((f, i) => serves.set(f, [...(serves.get(f) ?? []), i]));
      const delivered = new Set<number>();
      let halted = false;
      const byDecode = [...new Set(want)].map((f) => frames[f]!.decode).sort((a, b) => a - b);

      let failure: unknown = null;
      const paint = (vf: VideoFrame) => {
        ctx.save();
        ctx.translate(width / 2, height / 2);
        ctx.rotate((rot * Math.PI) / 180);
        ctx.drawImage(vf, -cw / 2, -ch / 2, cw, ch);
        ctx.restore();
      };
      // wait mode: frames queue here and are painted and handed over one at a time.
      const pending: Array<{ vf: VideoFrame; f: number; idx: number[] }> = [];
      let pumping: Promise<void> | null = null;
      const pump = () =>
        (pumping ??= (async () => {
          while (pending.length) {
            const { vf, f, idx } = pending.shift()!;
            try {
              if (halted || failure) continue;
              paint(vf);
              for (const i of idx) {
                if (delivered.has(i) || halted) continue;
                delivered.add(i);
                if ((await onFrame(i, canvas, times[f]!)) === false || stop?.()) halted = true;
              }
            } catch (e) {
              failure = e;
              halted = true;
            } finally {
              vf.close();
            }
          }
          pumping = null;
        })());
      const decoder = new VideoDecoder({
        output: (vf) => {
          const f = frameAt(vf.timestamp / 1e6 + 1e-7);
          const idx = serves.get(f);
          if (halted || !idx || idx.every((i) => delivered.has(i))) return vf.close();
          if (wait) {
            pending.push({ vf, f, idx });
            void pump();
            return;
          }
          try {
            paint(vf);
            for (const i of idx) {
              if (delivered.has(i) || halted) continue;
              delivered.add(i);
              if (onFrame(i, canvas, times[f]!) === false || stop?.()) halted = true;
            }
          } finally {
            vf.close();
          }
        },
        error: (e) => (failure = e),
      });
      // At most two decoded frames held while the consumer works.
      const drained = async () => {
        while (wait && pending.length >= 2 && pumping) await pumping;
      };
      decoder.configure(config);
      const room = () =>
        decoder.decodeQueueSize < 8
          ? Promise.resolve()
          : new Promise<void>((r) => decoder.addEventListener("dequeue", () => r(), { once: true }));

      // Decode each needed frame's group of pictures once, from its keyframe, in order;
      // groups holding no needed frame are skipped.
      let next = 0; // next decode index to feed
      let cache: { from: number; buf: Uint8Array } | null = null;
      const bytes = async (s: Sample) => {
        if (!cache || s.offset < cache.from || s.offset + s.size > cache.from + cache.buf.byteLength) {
          const from = s.offset;
          cache = { from, buf: new Uint8Array(await file.slice(from, Math.min(file.size, from + Math.max(CHUNK, s.size))).arrayBuffer()) };
        }
        return cache.buf.subarray(s.offset - cache.from, s.offset - cache.from + s.size);
      };
      for (const d of byDecode) {
        if (halted || failure || stop?.()) break;
        if (d < next) continue;
        const key = syncBefore(d);
        if (key > next || next === 0) {
          if (next > 0) await decoder.flush();
          next = key;
        }
        // Feed through this frame, and on to the end of its group so reordered frames come out.
        let end = d;
        while (end + 1 < samples.length && !samples[end + 1]!.is_sync && samples[end + 1]!.cts < samples[d]!.cts) end++;
        for (; next <= end && !halted && !failure; next++) {
          const s = samples[next]!;
          await drained();
          await room();
          decoder.decode(new EncodedVideoChunk({ type: s.is_sync ? "key" : "delta", timestamp: Math.round((s.cts / ts - shift) * 1e6), duration: Math.round((s.duration / ts) * 1e6), data: await bytes(s) }));
        }
      }
      if (!failure && decoder.state === "configured") await decoder.flush().catch((e) => (failure = e));
      while (pumping) await pumping;
      if (decoder.state !== "closed") decoder.close();
      if (failure && !delivered.size) throw failure;
      return targets.map((_, i) => i).filter((i) => !delivered.has(i));
    };

    return { width, height, fps, times, read, close: () => mp4.flush() };
  } catch {
    return null;
  }
}
