// EcoTrack/frontend/src/components/GoalRing.jsx
// An animated circular progress ring, drawn with SVG.
//
// HOW THE RING IS DRAWN (worth understanding for the viva)
// There is no "draw 60% of a circle" instruction in SVG. The trick is to draw
// a complete circle, then use a dashed stroke whose dash is exactly as long as
// the circle's circumference:
//
//   circumference = 2 × π × radius
//
// With one dash that long and one equally long gap, the whole circle is a
// single dash. Sliding the dash along with strokeDashoffset then hides part of
// it - an offset of 0 shows the full circle, an offset of the full
// circumference hides all of it. Animating that offset "draws" the ring.
//
// Used by the Calculator (this entry versus your daily average) and by the
// Goals page (progress towards a reduction target).

import { motion } from 'framer-motion';

import { useTheme } from '../context/ThemeContext';

/**
 * Colour band for a progress value, matching the backend's progressBand.
 * Red at the start, green once the goal is nearly met.
 */
export function bandColor(percent) {
  if (percent < 25) return 'var(--eco-danger)';
  if (percent < 50) return 'var(--eco-orange)';
  if (percent < 75) return '#eab308';
  return 'var(--eco-primary)';
}

/**
 * @param {number} percent      0-100, clamped
 * @param {number} size         width and height in pixels
 * @param {number} strokeWidth  thickness of the ring
 * @param {string} color        override the automatic band colour
 * @param {string} label        big text in the middle
 * @param {string} sublabel     small text under the label
 * @param {number} delay        seconds before the draw starts
 * @param {boolean} invert      true when a HIGH value is bad (Calculator uses
 *                              this: a large share of your daily average is
 *                              not an achievement)
 */
export default function GoalRing({
  percent = 0,
  size = 150,
  strokeWidth = 10,
  color,
  label,
  sublabel,
  delay = 0.15,
  invert = false,
  children,
}) {
  const { prefersReducedMotion } = useTheme();

  // Never draw past a full circle, and never draw backwards
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));

  // The radius has to allow for the stroke, which straddles the path
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // How much of the dash to hide. 100% progress hides nothing.
  const targetOffset = circumference - (safePercent / 100) * circumference;

  // When invert is set, the colour scale runs the other way: a high number is
  // a warning rather than a success
  const resolvedColor =
    color || (invert ? bandColor(100 - safePercent) : bandColor(safePercent));

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg
        width={size}
        height={size}
        // Rotating the whole SVG makes the ring start at 12 o'clock instead of
        // 3 o'clock, which is where people expect progress to begin
        style={{ transform: 'rotate(-90deg)' }}
        aria-hidden="true"
      >
        {/* The empty track sitting underneath */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--eco-border)"
          strokeWidth={strokeWidth}
        />

        {/* The progress arc */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={resolvedColor}
          strokeWidth={strokeWidth}
          // strokeLinecap="round" gives the arc a rounded tip rather than a
          // blunt square edge
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={prefersReducedMotion ? false : { strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: targetOffset }}
          transition={{
            duration: prefersReducedMotion ? 0 : 1.1,
            delay: prefersReducedMotion ? 0 : delay,
            ease: [0.22, 1, 0.36, 1],
          }}
          style={{
            // A soft glow in the ring's own colour, which makes it read as lit
            filter: `drop-shadow(0 0 6px color-mix(in srgb, ${resolvedColor} 33%, transparent))`,
          }}
        />
      </svg>

      {/* Whatever sits in the middle of the ring */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: strokeWidth,
        }}
      >
        {children || (
          <>
            {label !== undefined && (
              <div
                style={{
                  fontFamily: 'Space Grotesk, sans-serif',
                  fontWeight: 700,
                  fontSize: size * 0.19,
                  lineHeight: 1.1,
                  color: resolvedColor,
                }}
              >
                {label}
              </div>
            )}
            {sublabel && (
              <div
                className="eco-text-muted"
                style={{ fontSize: size * 0.078, marginTop: 4, lineHeight: 1.3 }}
              >
                {sublabel}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
