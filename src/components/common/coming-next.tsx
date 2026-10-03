import Link from "next/link";

/** Honest placeholder for areas still being built in this release. */
export function ComingNext({ eyebrow, title, points }: { eyebrow: string; title: string; points: string[] }) {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-14">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="display mt-3 text-5xl">{title}</h1>
      <p className="mt-4 text-fg-muted">This area is being built in the current release. Here is what it will contain:</p>
      <ul className="mt-4 space-y-2 list-disc pl-5 text-fg-muted">
        {points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/sample" className="btn btn-primary">See sample reports</Link>
        <Link href="/home" className="btn btn-ghost">Home</Link>
      </div>
    </div>
  );
}
