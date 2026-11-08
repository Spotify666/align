// A video's soundtrack, for checking that two videos are the same ball (engine/same-ball.ts).
// Decoded once in the browser and reduced to its onset envelope (100 values a second).
import { onsetEnvelope } from "@/engine/same-ball";

/** Larger files aren't decoded for sound (memory on a phone); the check then says it can't tell. */
const MAX_BYTES = 300e6;

/** The onset envelope of a video's soundtrack, or null when it has none the browser can read. */
export async function soundEnvelope(src: Blob | null | undefined): Promise<Float32Array | null> {
  if (!src || src.size > MAX_BYTES || typeof OfflineAudioContext === "undefined") return null;
  try {
    const ctx = new OfflineAudioContext(1, 1, 16000);
    const audio = await ctx.decodeAudioData(await src.arrayBuffer());
    const n = audio.length;
    const mono = new Float32Array(n);
    for (let c = 0; c < audio.numberOfChannels; c++) {
      const d = audio.getChannelData(c);
      for (let i = 0; i < n; i++) mono[i]! += d[i]! / audio.numberOfChannels;
    }
    return onsetEnvelope(mono, audio.sampleRate);
  } catch {
    return null;
  }
}
