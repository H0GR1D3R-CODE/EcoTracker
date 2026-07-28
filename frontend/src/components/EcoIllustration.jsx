// EcoTrack/frontend/src/components/EcoIllustration.jsx
//
// Original vector illustrations of real-world carbon issues, drawn in code.
//
// WHY VECTOR, NOT STOCK PHOTOS
//   - Reliability: these are part of the app, so they never fail to load and
//     need no internet - which matters for an offline demo.
//   - Originality: stock photos in a submitted project are a copyright and
//     academic-integrity risk. These are our own assets.
//   - They are theme-aware (the gradients use the app's CSS variables, so they
//     recolour in light mode) and razor sharp at any size, which is a big part
//     of why a premium interface looks premium.
//
// Each illustration is a self-contained <svg>. Gradient ids are suffixed with
// the illustration name so several can render on one page without their <defs>
// colliding - a real bug when two SVGs share a gradient id.

import { useId } from 'react';

// ---------------------------------------------------------------------------
// INDUSTRY - factory with smokestacks. Emissions from industry are ~21% of the
// global total, the biggest single sector after energy.
// ---------------------------------------------------------------------------

function Industry({ gid }) {
  return (
    <svg viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id={`${gid}-body`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--eco-primary)" />
          <stop offset="100%" stopColor="var(--eco-purple)" />
        </linearGradient>
        <linearGradient id={`${gid}-smoke`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="var(--eco-purple)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--eco-purple)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* rising smoke */}
      <g>
        <circle cx="66" cy="34" r="12" fill={`url(#${gid}-smoke)`} />
        <circle cx="74" cy="22" r="9" fill={`url(#${gid}-smoke)`} />
        <circle cx="104" cy="28" r="14" fill={`url(#${gid}-smoke)`} />
        <circle cx="114" cy="14" r="10" fill={`url(#${gid}-smoke)`} />
      </g>

      {/* stacks */}
      <rect x="60" y="52" width="14" height="52" rx="2" fill={`url(#${gid}-body)`} />
      <rect x="100" y="46" width="14" height="58" rx="2" fill={`url(#${gid}-body)`} />

      {/* factory block */}
      <path
        d="M28 104 V72 l24 14 V72 l24 14 V104 Z"
        fill="var(--eco-card-hover)"
        stroke={`url(#${gid}-body)`}
        strokeWidth="2.5"
      />
      <rect x="24" y="102" width="152" height="10" rx="3" fill={`url(#${gid}-body)`} />
      <rect x="130" y="70" width="42" height="34" rx="3" fill="var(--eco-card-hover)" stroke={`url(#${gid}-body)`} strokeWidth="2.5" />

      {/* windows */}
      <rect x="36" y="90" width="7" height="7" rx="1.5" fill="var(--eco-primary)" opacity="0.7" />
      <rect x="60" y="90" width="7" height="7" rx="1.5" fill="var(--eco-primary)" opacity="0.7" />
      <rect x="140" y="80" width="8" height="8" rx="1.5" fill="var(--eco-primary)" opacity="0.7" />
      <rect x="156" y="80" width="8" height="8" rx="1.5" fill="var(--eco-primary)" opacity="0.7" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// TRANSPORT - a car on a road. Transport is ~24% of energy-related CO2, and the
// fastest-growing source in most countries.
// ---------------------------------------------------------------------------

function Transport({ gid }) {
  return (
    <svg viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id={`${gid}-body`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--eco-primary)" />
          <stop offset="100%" stopColor="var(--eco-purple)" />
        </linearGradient>
        <linearGradient id={`${gid}-fumes`} x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%" stopColor="var(--eco-orange)" stopOpacity="0.45" />
          <stop offset="100%" stopColor="var(--eco-orange)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* exhaust */}
      <circle cx="46" cy="86" r="7" fill={`url(#${gid}-fumes)`} />
      <circle cx="34" cy="82" r="5" fill={`url(#${gid}-fumes)`} />

      {/* car body */}
      <path
        d="M58 92 Q64 70 84 70 h34 q14 0 22 12 l14 8 q10 2 10 10 v6 H58 Z"
        fill={`url(#${gid}-body)`}
      />
      {/* windows */}
      <path d="M86 72 h26 q10 0 16 9 H86 Z" fill="var(--eco-bg)" opacity="0.55" />
      <line x1="104" y1="72" x2="104" y2="81" stroke="var(--eco-bg)" strokeWidth="2" opacity="0.55" />

      {/* wheels */}
      <circle cx="82" cy="102" r="12" fill="var(--eco-card-hover)" stroke={`url(#${gid}-body)`} strokeWidth="4" />
      <circle cx="140" cy="102" r="12" fill="var(--eco-card-hover)" stroke={`url(#${gid}-body)`} strokeWidth="4" />
      <circle cx="82" cy="102" r="3" fill="var(--eco-primary)" />
      <circle cx="140" cy="102" r="3" fill="var(--eco-primary)" />

      {/* road */}
      <line x1="20" y1="118" x2="180" y2="118" stroke="var(--eco-border)" strokeWidth="3" />
      <line x1="30" y1="118" x2="50" y2="118" stroke="var(--eco-primary)" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
      <line x1="70" y1="118" x2="90" y2="118" stroke="var(--eco-primary)" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// ENERGY - power lines and a grid pylon. Electricity and heat production is the
// single largest source of global emissions, about 25%, because so much of it
// still burns coal and gas.
// ---------------------------------------------------------------------------

function Energy({ gid }) {
  return (
    <svg viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id={`${gid}-body`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--eco-primary)" />
          <stop offset="100%" stopColor="var(--eco-purple)" />
        </linearGradient>
      </defs>

      {/* pylon */}
      <g stroke={`url(#${gid}-body)`} strokeWidth="3" strokeLinecap="round">
        <path d="M100 26 L78 112 M100 26 L122 112" />
        <path d="M84 92 L116 92 M88 74 L112 74 M91 58 L109 58" />
        <path d="M84 92 L116 74 M116 92 L84 74 M88 74 L112 58 M112 74 L88 58" />
        {/* cross arms */}
        <path d="M70 52 L130 52 M74 68 L126 68" />
      </g>

      {/* insulators / lines */}
      <circle cx="70" cy="52" r="3.5" fill="var(--eco-primary)" />
      <circle cx="130" cy="52" r="3.5" fill="var(--eco-primary)" />
      <path d="M70 52 Q40 66 14 60 M130 52 Q160 66 186 60" stroke={`url(#${gid}-body)`} strokeWidth="2" fill="none" opacity="0.6" />

      {/* energy bolt badge */}
      <circle cx="100" cy="40" r="14" fill="var(--eco-card-hover)" stroke={`url(#${gid}-body)`} strokeWidth="2.5" />
      <path d="M102 32 L94 42 h6 l-2 8 8-10 h-6 Z" fill="var(--eco-primary)" />

      <line x1="20" y1="118" x2="180" y2="118" stroke="var(--eco-border)" strokeWidth="3" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// NATURE - trees, one being lost. Land-use change and deforestation account for
// a large slice of emissions and remove the very carbon sinks that would absorb
// the rest.
// ---------------------------------------------------------------------------

function Nature({ gid }) {
  return (
    <svg viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id={`${gid}-leaf`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--eco-primary)" />
          <stop offset="100%" stopColor="var(--eco-dark-green, #00c96b)" />
        </linearGradient>
        <linearGradient id={`${gid}-fade`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--eco-purple)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="var(--eco-purple)" stopOpacity="0.15" />
        </linearGradient>
      </defs>

      {/* healthy trees */}
      <g>
        <rect x="46" y="80" width="6" height="30" rx="2" fill="var(--eco-purple)" opacity="0.7" />
        <path d="M49 34 C30 54 32 76 49 82 C66 76 68 54 49 34 Z" fill={`url(#${gid}-leaf)`} />
        <rect x="86" y="88" width="7" height="26" rx="2" fill="var(--eco-purple)" opacity="0.7" />
        <path d="M89.5 46 C68 66 70 88 89.5 94 C109 88 111 66 89.5 46 Z" fill={`url(#${gid}-leaf)`} />
      </g>

      {/* a faded / lost tree (deforestation) */}
      <g opacity="0.9">
        <rect x="132" y="86" width="6" height="28" rx="2" fill="var(--eco-purple)" opacity="0.4" />
        <path d="M135 44 C116 64 118 84 135 90 C152 84 154 64 135 44 Z" fill={`url(#${gid}-fade)`} strokeDasharray="4 4" stroke="var(--eco-purple)" strokeWidth="1.5" />
      </g>

      {/* stump where a tree was */}
      <rect x="160" y="104" width="14" height="8" rx="2" fill="var(--eco-purple)" opacity="0.5" />

      {/* ground */}
      <line x1="20" y1="114" x2="180" y2="114" stroke="var(--eco-border)" strokeWidth="3" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// GLOBE - a warming planet, for the "why this matters" header.
// ---------------------------------------------------------------------------

function Globe({ gid }) {
  return (
    <svg viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id={`${gid}-planet`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--eco-primary)" />
          <stop offset="100%" stopColor="var(--eco-purple)" />
        </linearGradient>
        <radialGradient id={`${gid}-heat`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="60%" stopColor="var(--eco-orange)" stopOpacity="0" />
          <stop offset="100%" stopColor="var(--eco-orange)" stopOpacity="0.3" />
        </radialGradient>
      </defs>

      {/* heat halo */}
      <circle cx="100" cy="70" r="52" fill={`url(#${gid}-heat)`} />

      {/* planet */}
      <circle cx="100" cy="70" r="40" fill="var(--eco-card-hover)" stroke={`url(#${gid}-planet)`} strokeWidth="3" />

      {/* stylised continents */}
      <path d="M78 52 q10 -6 20 2 q8 6 2 14 q-10 6 -20 0 q-8 -8 -2 -16 Z" fill={`url(#${gid}-planet)`} opacity="0.85" />
      <path d="M108 74 q12 -2 16 8 q2 10 -10 12 q-12 0 -12 -10 q0 -8 6 -10 Z" fill={`url(#${gid}-planet)`} opacity="0.7" />

      {/* orbit ring */}
      <ellipse cx="100" cy="70" rx="56" ry="18" stroke={`url(#${gid}-planet)`} strokeWidth="1.5" opacity="0.4" fill="none" transform="rotate(-18 100 70)" />
    </svg>
  );
}

const SCENES = {
  industry: Industry,
  transport: Transport,
  energy: Energy,
  nature: Nature,
  globe: Globe,
};

/**
 * @param {string} name    one of: industry | transport | energy | nature | globe
 * @param {number|string} height   any CSS height; the SVG keeps its aspect ratio
 */
export default function EcoIllustration({ name, height = 120, style = {} }) {
  // useId gives a stable, unique id per instance so gradients never clash even
  // when the same illustration appears twice on a page
  const gid = useId().replace(/:/g, '');
  const Scene = SCENES[name] || SCENES.globe;

  return (
    <div style={{ width: '100%', height, ...style }}>
      <Scene gid={gid} />
    </div>
  );
}
