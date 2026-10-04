/**
 * A cricket ground seen from above, behind the landing page's dark sections: the
 * outfield's mowing stripes (the same width as the opening curtain's slats, so the turning
 * slats read as the outfield) and, when `pitch` is set, the 22-yard strip down the middle
 * with its creases and stumps at both ends and the gold line from middle stump to middle
 * stump. Drawn to scale (a pitch is 10 ft wide and 66 ft between the stumps), faint enough
 * to sit behind text.
 */
export function Ground({ pitch = false }: { pitch?: boolean }) {
  return (
    <div className="lp-ground" aria-hidden>
      {pitch && (
        <div className="lp-pitch">
          <i className="lp-line" />
          {(["top", "bottom"] as const).map((end) => (
            <div key={end} className={`lp-end lp-end-${end}`}>
              <i className="lp-bowling" />
              <i className="lp-popping" />
              <i className="lp-return lp-return-l" />
              <i className="lp-return lp-return-r" />
              <i className="lp-stumps" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
