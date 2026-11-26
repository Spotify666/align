import Link from "next/link";

export const metadata = { title: "Page not found" };

// Any address the app doesn't have (and a sample that doesn't exist): say so and offer the way in.
export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 space-y-4">
      <p className="eyebrow">Not found</p>
      <h1 className="display text-4xl">This page isn&apos;t here.</h1>
      <p className="text-fg-muted">The link may be old or mistyped.</p>
      <div className="flex flex-wrap gap-3">
        <Link href="/check" className="btn btn-primary">Check your shot</Link>
        <Link href="/home" className="btn btn-ghost">Go home</Link>
      </div>
    </div>
  );
}
