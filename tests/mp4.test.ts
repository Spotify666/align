import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { readVideoTrack } from "@/lib/capture/mp4";

const blob = async (name: string) => new Blob([await readFile(new URL(`./assets/${name}`, import.meta.url))]);

describe("container frame-rate reader", () => {
  it("reads true fps, frame count and size from an MP4", async () => {
    const t = await readVideoTrack(await blob("clip-120fps.mp4"));
    expect(t).not.toBeNull();
    expect(Math.round(t!.fps)).toBe(120);
    expect(t!.frameCount).toBe(60);
    expect([t!.width, t!.height]).toEqual([64, 36]);
  });
  it("reads a MOV (iPhone container) too", async () => {
    const t = await readVideoTrack(await blob("clip-30fps.mov"));
    expect(Math.round(t!.fps)).toBe(30);
  });
  it("returns null for something that is not a video", async () => {
    expect(await readVideoTrack(new Blob([new Uint8Array(64)]))).toBeNull();
  });
});
