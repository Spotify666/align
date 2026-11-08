// The build that is live now: open pages compare it with their own and reload when it changed
// (src/lib/fresh.ts). Never cached.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ id: process.env.NEXT_PUBLIC_BUILD_ID ?? "" }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
