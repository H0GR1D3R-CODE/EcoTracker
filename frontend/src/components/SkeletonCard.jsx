// EcoTrack/frontend/src/components/SkeletonCard.jsx
// Grey placeholder blocks shaped like the content that is loading.
//
// WHY THIS INSTEAD OF A SPINNER
// A spinner tells the user "wait". A skeleton tells them "your dashboard is
// coming, and it will look like this". The page never collapses and then jumps
// back into shape when the data lands, which is what makes an app feel slow
// even when it is fast.
//
// The shimmer animation comes from the .eco-skeleton class in index.css, and
// stops automatically when the user prefers reduced motion.

/**
 * A single grey block.
 */
export function SkeletonLine({ width = '100%', height = 14, radius = 6, style = {} }) {
  return (
    <div
      className="eco-skeleton"
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}

/**
 * Placeholder for one of the four readings on the dashboard.
 *
 * Shaped like a channel, not a card, because that is what StatCard renders now.
 * A skeleton that does not match what replaces it defeats the entire point of
 * having one: the page would settle into a different shape the moment the data
 * landed, which is exactly the jump this is here to prevent.
 */
export function SkeletonStatCard() {
  return (
    <div style={{ minHeight: 118, paddingTop: '0.95rem', borderTop: '1px solid var(--rule-strong)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <SkeletonLine width="45%" height={11} radius={2} />
        <SkeletonLine width={18} height={18} radius={4} />
      </div>
      <SkeletonLine width="60%" height={30} radius={3} style={{ marginTop: '1.1rem' }} />
      <SkeletonLine width="35%" height={10} radius={2} style={{ marginTop: '0.9rem' }} />
    </div>
  );
}

/**
 * Placeholder for PageBanner - shaped like the plate + caption it renders.
 *
 * A code review caught that Dashboard/Calculator/Goals' loading states never
 * reserved space for the banner at all, so the whole ~200-320px hero would
 * snap in above everything else the instant data arrived - a much bigger
 * jolt now that the banner is taller than it used to be. Same invariant as
 * every other skeleton here: shaped like what replaces it.
 */
export function SkeletonBanner() {
  return (
    <div style={{ marginBottom: '2.5rem' }}>
      <div
        className="eco-skeleton"
        style={{ height: 'clamp(200px, 28vh, 320px)', borderRadius: 'var(--eco-radius-sm)' }}
      />
      <div style={{ marginTop: '1.6rem', paddingTop: '1.1rem', borderTop: '1px solid var(--rule-strong)' }}>
        <SkeletonLine width={200} height={34} radius={6} style={{ marginBottom: '0.6rem' }} />
        <SkeletonLine width={300} height={14} radius={4} />
      </div>
    </div>
  );
}

/**
 * Placeholder for GlobalPictureSection's four-photo grid.
 */
export function SkeletonGlobalPicture() {
  return (
    <div style={{ marginBottom: '2.5rem' }}>
      <div style={{ marginBottom: '1.4rem', paddingTop: '1.05rem', borderTop: '1px solid var(--rule-strong)' }}>
        <SkeletonLine width={160} height={18} radius={3} style={{ marginBottom: '0.5rem' }} />
        <SkeletonLine width={280} height={12} radius={3} />
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1.4rem',
        }}
      >
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index}>
            <div
              className="eco-skeleton"
              style={{ height: 170, borderRadius: 'var(--eco-radius-sm)', marginBottom: '1.1rem' }}
            />
            <SkeletonLine width="70%" height={16} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Placeholder for a chart panel - also a channel now.
 */
export function SkeletonChart({ height = 300 }) {
  return (
    <div style={{ paddingTop: '1.05rem', borderTop: '1px solid var(--rule-strong)' }}>
      <SkeletonLine width="35%" height={16} radius={3} />
      <SkeletonLine width="100%" height={height} radius={6} style={{ marginTop: '1.4rem' }} />
    </div>
  );
}

/**
 * Placeholder rows for a data table.
 */
export function SkeletonTable({ rows = 5, columns = 4 }) {
  return (
    <div className="eco-card">
      <SkeletonLine width="28%" height={16} style={{ marginBottom: '1.3rem' }} />

      {/* Array.from({length: rows}) creates an empty array we can map over -
          a normal way to repeat an element N times in React */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${columns}, 1fr)`,
            gap: '1rem',
            marginBottom: '0.9rem',
          }}
        >
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <SkeletonLine
              key={columnIndex}
              // Varying the widths slightly stops it looking like graph paper
              width={columnIndex === 0 ? '80%' : '60%'}
              height={13}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * The default export: a general-purpose card placeholder.
 *
 * @param {number} lines  how many text lines to draw
 */
export default function SkeletonCard({ lines = 3, showHeader = true, height }) {
  return (
    <div className="eco-card" style={height ? { minHeight: height } : undefined}>
      {showHeader && <SkeletonLine width="42%" height={18} style={{ marginBottom: '1.2rem' }} />}

      {Array.from({ length: lines }).map((_, index) => (
        <SkeletonLine
          key={index}
          // The last line is shorter, the way a real paragraph ends
          width={index === lines - 1 ? '55%' : '100%'}
          style={{ marginBottom: '0.75rem' }}
        />
      ))}
    </div>
  );
}
