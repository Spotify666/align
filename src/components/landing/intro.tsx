import { Mark } from "@/components/icons";

/**
 * The landing page's opening, like a film studio's ident before the feature: the mark
 * spins in, its gold line runs the height of the screen, then the curtain splits along
 * that line and swings open onto the page. About 1.3 s, pure CSS (it plays before any
 * script loads and costs nothing to run), never blocks a tap, and is skipped for anyone
 * who prefers reduced motion.
 */
export function Intro() {
  return (
    <div className="intro" aria-hidden>
      <div className="intro-half intro-left" />
      <div className="intro-half intro-right" />
      <div className="intro-line" />
      <div className="intro-mark">
        <span className="block overflow-hidden rounded-[30px]">
          <Mark size={120} />
        </span>
      </div>
    </div>
  );
}
