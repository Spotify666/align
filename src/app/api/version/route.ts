// The build that is live now: open pages compare it with their own and reload when it changed
// (src/lib/fresh.ts). Never kept by a browser; the host's CDN keeps it for 30 s, so many open
// pages asking at once cost one call a deployment per 30 s, not one each (a new deployment has
// its own cache, so it is seen at once).
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ id: process.env.NEXT_PUBLIC_BUILD_ID ?? "" }, {
    headers: { "Cache-Control": "no-store, max-age=0", "CDN-Cache-Control": "public, max-age=30" },
  });
}
