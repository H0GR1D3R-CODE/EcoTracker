// EcoTrack/frontend/src/components/GlobalPictureSection.jsx
//
// "The bigger picture" - the Dashboard's one photo-led section, zooming out
// from the user's own number to where the world's emissions actually come
// from, with a cited figure and an illustration for each. Every card links
// to the EcoTrack category the user can act on.
//
// Extracted out of Dashboard.jsx rather than left inline: a code review
// flagged that this self-contained, animated block (own data, own layout,
// own captions) was exactly the shape ImpactEquivalents.jsx was already
// created to solve - "the same panel is needed on the Dashboard, the
// Calculator and the Reports page, and copying it three times would
// guarantee the three copies eventually disagreed." Reordering it within
// Dashboard also used to be a 230-line delete-and-reinsert diff; now it is
// a one-line move of <GlobalPictureSection />.
//
// Uses the shared Reveal component for its entrance animation rather than a
// hand-rolled motion.div, matching every other animated section on the page.

import Reveal from './Reveal';
import Photo from './Photo';
import { PHOTOS } from '../utils/photos';

// The accents are the theme-aware category variables, not hardcoded hexes.
// Two of those were measured failures on the light ground: transport's
// #00ff87 came out at 1.21:1 (near-invisible), and #f59e0b at 2.15:1. They
// also no longer matched the colour each category carries everywhere else
// in the app, which is the point of tying them to the category at all.
const GLOBAL_SOURCES = [
  {
    photo: 'powerPlant4',
    alt: 'An electricity transmission pylon in a field',
    title: 'Energy & electricity',
    share: '~25%',
    color: 'var(--cat-electricity)',
    body: 'Producing electricity and heat is the single largest source of global emissions, because so much of it still burns coal and gas.',
    tie: 'Your Electricity category',
    source: 'IPCC / EPA',
  },
  {
    photo: 'traffic4',
    alt: 'Cars on a road',
    title: 'Transport',
    share: '~24%',
    color: 'var(--cat-transport)',
    body: 'Cars, trucks, ships and planes together, and the fastest-growing source of emissions in most countries.',
    tie: 'Your Transport category',
    source: 'IEA',
  },
  {
    photo: 'factory3',
    alt: 'A large industrial factory',
    title: 'Industry',
    share: '~21%',
    color: 'var(--org-goldstandard)',
    body: 'Making steel, cement, chemicals and goods. Much of a product’s carbon is spent before it ever reaches you.',
    tie: 'Your Consumption category',
    source: 'EPA',
  },
  {
    photo: 'forest3',
    alt: 'Green forest on a mountainside',
    title: 'Land use & waste',
    share: '~18%',
    color: 'var(--cat-water)',
    body: 'Deforestation, farming and rotting landfill. This slice both emits carbon and destroys the forests that would absorb it.',
    tie: 'Your Diet & Waste categories',
    source: 'Our World in Data',
  },
];

export default function GlobalPictureSection() {
  return (
    <div style={{ marginBottom: '2.5rem' }}>
      <div style={{ marginBottom: '1.4rem', paddingTop: '1.05rem', borderTop: '1px solid var(--rule-strong)' }}>
        <h2 className="eco-display" style={{ fontSize: '1.25rem', margin: '0 0 0.25rem' }}>
          The bigger picture
        </h2>
        <p className="eco-text-muted" style={{ margin: 0, fontSize: '0.85rem' }}>
          Where the world&rsquo;s carbon comes from — and the category of yours that maps to it
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1.4rem',
        }}
      >
        {GLOBAL_SOURCES.map((item, index) => (
          <Reveal
            key={item.title}
            y={24}
            duration={0.5}
            delay={index * 0.08}
            style={{ display: 'flex', flexDirection: 'column' }}
          >
            {/* the plate, captioned by what follows it. 170px tall - this
                section opens the page's visual story rather than closing it
                as a footnote, so the photograph carries real weight. */}
            <div
              className="eco-photo-zoom"
              style={{
                height: 170,
                overflow: 'hidden',
                borderRadius: 'var(--eco-radius-sm)',
                marginBottom: '1.1rem',
              }}
            >
              <Photo
                id={PHOTOS[item.photo]}
                alt={item.alt}
                width={560}
                color={item.color}
                className="eco-photo-cover"
                style={{ width: '100%', height: '100%', display: 'block' }}
              />
            </div>

            {/* the reading first, then what it is a reading of */}
            <div style={{ paddingTop: '0.95rem', borderTop: '1px solid var(--rule-strong)', display: 'flex', flexDirection: 'column', flex: 1 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  marginBottom: '0.8rem',
                }}
              >
                {/* The share is a measurement wearing the colour of the
                    thing it measures - the one rule the palette rests on. */}
                <span className="eco-readout" style={{ fontSize: '1.2rem', fontWeight: 500 }}>
                  {item.share}
                </span>
                <span
                  aria-hidden="true"
                  style={{ width: 7, height: 7, borderRadius: 2, background: item.color, flexShrink: 0 }}
                />
              </div>

              <h3 className="eco-display" style={{ fontSize: '1.05rem', fontWeight: 600, margin: '0 0 0.45rem' }}>
                {item.title}
              </h3>

              <p
                className="eco-text-muted"
                style={{ fontSize: '0.84rem', lineHeight: 1.6, margin: '0 0 1rem' }}
              >
                {item.body}
              </p>

              <div
                style={{
                  marginTop: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  paddingTop: '0.7rem',
                  borderTop: '1px solid var(--rule)',
                }}
              >
                <span className="eco-marker" style={{ fontSize: '0.62rem' }}>
                  {item.tie}
                </span>
                <span className="eco-marker" style={{ fontSize: '0.62rem', opacity: 0.7 }}>
                  {item.source}
                </span>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
