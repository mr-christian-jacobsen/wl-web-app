/**
 * Render a step-type's SVG icon so it picks up the parent's text colour.
 *
 * The icons in `STEP_TYPES` are `data:image/svg+xml` URLs with
 * `stroke="currentColor"`, but inside an `<img>` element the SVG runs in its
 * own document — `currentColor` there is the SVG's own default (black), not
 * the parent button's text colour. The result: when a tile's background goes
 * dark on select, the icon stays black and disappears.
 *
 * Using the data URL as a CSS mask sidesteps the problem: the mask just gives
 * us the silhouette, and the visible colour comes from the wrapper's
 * `background-color: currentColor`, which DOES inherit from Tailwind's
 * `text-*` classes on the parent.
 */
export function StepTypeIcon({
  src,
  className,
}: {
  src: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        backgroundColor: "currentColor",
        WebkitMaskImage: `url("${src}")`,
        maskImage: `url("${src}")`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        display: "block",
      }}
    />
  );
}
