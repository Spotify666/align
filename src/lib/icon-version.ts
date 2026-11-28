// Which drawing of the app's icons is live. Phones keep an icon by its address and never fetch the
// same address again, so a redrawn icon needs a new one (the owner, 2026-11-28: the old sage icon
// still showing after the icons were redrawn). Change this whenever `scripts/brand-icons.mjs` is re-run.
export const ICON_VERSION = "2";
export const iconUrl = (path: string) => `${path}?v=${ICON_VERSION}`;
