/**
 * The walnut ground: a painted gradient plus a real wood grain from an SVG
 * turbulence filter stretched hard on one axis. Pure CSS and SVG, no client
 * JavaScript, so it renders on the server and costs nothing to hydrate.
 */
export function TableTop() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            'radial-gradient(120% 80% at 50% -14%, rgb(158 105 48 / .34), transparent 62%), linear-gradient(180deg, #33220F, #150E08 78%)',
        }}
      />
      <svg
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[1] h-full w-full opacity-[.42] mix-blend-overlay"
        preserveAspectRatio="none"
      >
        <filter id="woodgrain" x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.78 0.0055"
            numOctaves="6"
            seed="11"
            result="n"
          />
          <feColorMatrix in="n" type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#woodgrain)" />
      </svg>
    </>
  );
}
