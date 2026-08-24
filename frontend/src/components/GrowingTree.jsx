// EcoTrack/frontend/src/components/GrowingTree.jsx
// The visual half of the points/reward system - see
// backend/routes/engagement.py's module docstring for why this is a
// growing tree and not a wallet. Every claimed challenge earns
// POINTS_PER_CHALLENGE_CLAIM points; this draws whichever of the six
// growth stages that lifetime total currently lands on, from a bare seed
// through a full banyan - see TREE_STAGES there for the exact thresholds,
// which this component treats as data (`stages` prop) rather than
// hardcoding a second copy of them here.
//
// Six hand-drawn SVG stages, not one shape scaled up - a circle stretched
// larger does not read as "grew into a tree", but a trunk gaining a second
// branch and a canopy gaining depth does. The banyan stage adds drooping
// aerial roots either side of the trunk, the one visual detail that marks
// a banyan apart from an ordinary tree.
//
// No gradients (see the design-system note in Insights.jsx and elsewhere)
// - every fill is a flat app token, layered for depth instead.

import { AnimatePresence, motion } from 'framer-motion';

import { useTheme } from '../context/ThemeContext';

const GROUND_Y = 178;
// --readout, not one of the org-* brand colours (those are One Tree
// Planted/Cool Earth/etc.'s own donation-card accents elsewhere in the app -
// reusing one here for a trunk would be a confusing coincidence, not a
// deliberate reference). --readout is already this app's amber/bark tone
// for a "measured value" elsewhere, which reads naturally as wood here too.
const TRUNK_COLOR = 'var(--readout)';
const CANOPY_COLOR = 'var(--eco-primary)';
// Mixed toward black rather than referencing a background token - a
// deterministic darker shade of the same green in both themes, for canopy
// depth, not a second colour to keep in sync with light/dark separately.
const CANOPY_SHADE = 'color-mix(in srgb, var(--eco-primary) 65%, black)';

function Ground() {
  return <line x1="15" y1={GROUND_Y} x2="185" y2={GROUND_Y} stroke="var(--rule-strong)" strokeWidth="1.5" />;
}

function SeedStage() {
  return (
    <g>
      <Ground />
      <ellipse cx="100" cy={GROUND_Y - 4} rx="7" ry="4.5" fill="var(--org-onetree)" />
    </g>
  );
}

function SproutStage() {
  return (
    <g>
      <Ground />
      <line x1="100" y1={GROUND_Y} x2="100" y2={GROUND_Y - 26} stroke={CANOPY_COLOR} strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="91" cy={GROUND_Y - 24} rx="9" ry="5" fill={CANOPY_COLOR} transform={`rotate(-30 91 ${GROUND_Y - 24})`} />
      <ellipse cx="109" cy={GROUND_Y - 22} rx="9" ry="5" fill={CANOPY_COLOR} transform={`rotate(30 109 ${GROUND_Y - 22})`} />
    </g>
  );
}

function SaplingStage() {
  return (
    <g>
      <Ground />
      <line x1="100" y1={GROUND_Y} x2="100" y2={GROUND_Y - 46} stroke={TRUNK_COLOR} strokeWidth="4" strokeLinecap="round" />
      <circle cx="100" cy={GROUND_Y - 62} r="20" fill={CANOPY_COLOR} />
    </g>
  );
}

function YoungTreeStage() {
  return (
    <g>
      <Ground />
      <line x1="100" y1={GROUND_Y} x2="100" y2={GROUND_Y - 62} stroke={TRUNK_COLOR} strokeWidth="6" strokeLinecap="round" />
      <circle cx="82" cy={GROUND_Y - 78} r="19" fill={CANOPY_SHADE} />
      <circle cx="118" cy={GROUND_Y - 78} r="19" fill={CANOPY_SHADE} />
      <circle cx="100" cy={GROUND_Y - 92} r="24" fill={CANOPY_COLOR} />
    </g>
  );
}

function MatureTreeStage() {
  return (
    <g>
      <Ground />
      <line x1="100" y1={GROUND_Y} x2="100" y2={GROUND_Y - 76} stroke={TRUNK_COLOR} strokeWidth="8" strokeLinecap="round" />
      <line x1="100" y1={GROUND_Y - 40} x2="78" y2={GROUND_Y - 58} stroke={TRUNK_COLOR} strokeWidth="4" strokeLinecap="round" />
      <line x1="100" y1={GROUND_Y - 48} x2="122" y2={GROUND_Y - 66} stroke={TRUNK_COLOR} strokeWidth="4" strokeLinecap="round" />
      <circle cx="68" cy={GROUND_Y - 88} r="20" fill={CANOPY_SHADE} />
      <circle cx="132" cy={GROUND_Y - 88} r="20" fill={CANOPY_SHADE} />
      <circle cx="82" cy={GROUND_Y - 108} r="24" fill={CANOPY_COLOR} />
      <circle cx="118" cy={GROUND_Y - 108} r="24" fill={CANOPY_COLOR} />
      <circle cx="100" cy={GROUND_Y - 116} r="27" fill={CANOPY_COLOR} />
    </g>
  );
}

function BanyanStage() {
  // Aerial roots - thin curved lines dropping from the wide canopy back
  // down to the ground either side of the trunk. This one detail is what
  // reads as "banyan" rather than just "big tree".
  const roots = [
    'M60,110 C58,135 55,158 52,178',
    'M45,118 C42,140 40,160 38,178',
    'M140,110 C142,135 145,158 148,178',
    'M155,118 C158,140 160,160 162,178',
  ];
  return (
    <g>
      <Ground />
      {roots.map((d) => (
        <path key={d} d={d} stroke={TRUNK_COLOR} strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.75" />
      ))}
      <line x1="100" y1={GROUND_Y} x2="100" y2={GROUND_Y - 84} stroke={TRUNK_COLOR} strokeWidth="10" strokeLinecap="round" />
      <line x1="100" y1={GROUND_Y - 44} x2="65" y2={GROUND_Y - 66} stroke={TRUNK_COLOR} strokeWidth="5" strokeLinecap="round" />
      <line x1="100" y1={GROUND_Y - 52} x2="135" y2={GROUND_Y - 74} stroke={TRUNK_COLOR} strokeWidth="5" strokeLinecap="round" />
      <circle cx="50" cy={GROUND_Y - 96} r="21" fill={CANOPY_SHADE} />
      <circle cx="150" cy={GROUND_Y - 96} r="21" fill={CANOPY_SHADE} />
      <circle cx="70" cy={GROUND_Y - 116} r="26" fill={CANOPY_COLOR} />
      <circle cx="130" cy={GROUND_Y - 116} r="26" fill={CANOPY_COLOR} />
      <circle cx="100" cy={GROUND_Y - 126} r="32" fill={CANOPY_COLOR} />
    </g>
  );
}

const STAGE_ART = [SeedStage, SproutStage, SaplingStage, YoungTreeStage, MatureTreeStage, BanyanStage];

/**
 * @param {number} stageIndex   0 (seed) through 5 (banyan) - matches
 *                               backend TREE_STAGES order exactly.
 * @param {number} size         rendered pixel width/height, square viewBox
 */
export default function GrowingTree({ stageIndex = 0, size = 160 }) {
  const { prefersReducedMotion } = useTheme();
  const Stage = STAGE_ART[Math.max(0, Math.min(stageIndex, STAGE_ART.length - 1))];

  return (
    <svg viewBox="0 0 200 200" width={size} height={size} role="img" aria-label="Your reward tree">
      <AnimatePresence mode="wait" initial={false}>
        <motion.g
          key={stageIndex}
          initial={prefersReducedMotion ? false : { scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          style={{ transformOrigin: `100px ${GROUND_Y}px` }}
        >
          <Stage />
        </motion.g>
      </AnimatePresence>
    </svg>
  );
}
