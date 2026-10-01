"use client";
// Object URLs for videos picked in this browser session. Raw video is never stored;
// after a reload the report falls back to the saved still frames.
export const sessionMedia = new Map<string, { url: string; mediaTimes: number[] | null }>();
export const isSessionUrl = (url: string) => [...sessionMedia.values()].some((m) => m.url === url);
