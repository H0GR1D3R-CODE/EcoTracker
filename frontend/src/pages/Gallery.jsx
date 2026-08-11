// EcoTrack/frontend/src/pages/Gallery.jsx
// Public "gallery" - an editorial photo essay on the systems behind the carbon
// numbers. Real photographs (see utils/photos.js). A full-bleed opener, then
// alternating image/text rows with a mono index and generous whitespace; each
// row reveals as it scrolls in. Every plate falls back to a themed gradient if
// its photo ever fails to load.
//
// Restyled into the instrument system. The opener carried its title in white
// type over an 82%-black scrim, and each row led with a huge translucent
// numeral in the panel's own colour. Both are gone: photographs are captioned
// rather than written on, and the index is a mono readout - the same marking
// the calibration rail uses down the left edge of every page.

import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

import Photo from '../components/Photo';
import { PHOTOS } from '../utils/photos';
import { useTheme } from '../context/ThemeContext';

// The full-bleed opener.
const FEATURED = {
  photo: 'forest',
  tag: 'Our planet',
  color: 'var(--org-onetree)',
  title: 'One planet, one atmosphere',
  caption:
    'Every tonne of CO₂ we emit ends up in the same shared sky. A forest like this one absorbs some of it back — proof the balance can still tip the right way.',
  alt: 'Aerial view of a road winding through dense green forest',
};

// The essay: the sources of carbon, then the ways out.
//
// The accents were hardcoded hexes picked against the old near-black ground,
// and several had drifted off the category they belong to - "Diet" carried the
// consumption pink, "Consumption" carried the fuel red. Each panel now uses the
// theme-aware variable for the thing it is actually about, so a tag here is the
// same colour that subject carries on Home, in the Calculator and on the
// dashboard.
const PANELS = [
  {
    photo: 'factory',
    tag: 'Industry',
    color: 'var(--org-goldstandard)',
    title: 'Industry & manufacturing',
    caption:
      'Steel, cement and chemicals are carbon-heavy to make — around a fifth of global emissions are spent producing goods before they are ever used.',
    alt: 'Factories releasing smoke under a cloudy sky',
  },
  {
    photo: 'traffic',
    tag: 'Transport',
    color: 'var(--cat-transport)',
    title: 'Roads & the daily commute',
    caption:
      'Cars, buses, trains and flights are roughly a quarter of energy-related emissions, and the fastest-growing source in most countries.',
    alt: 'Aerial photograph of a busy multi-lane road full of cars',
  },
  {
    photo: 'powerPlant',
    tag: 'Energy',
    color: 'var(--cat-electricity)',
    title: 'The grid that powers us',
    caption:
      'Electricity and heat are the single largest source worldwide. On a coal-heavy grid like India’s, every unit of power carries a heavy carbon cost.',
    alt: 'Power-station smokestacks beside a body of water',
  },
  {
    photo: 'meal',
    tag: 'Diet',
    color: 'var(--cat-diet)',
    title: 'The carbon on your plate',
    caption:
      'Food carries the emissions of everything that produced it. A meat meal averages three times the carbon of a vegan one — one of the easiest swaps to make.',
    alt: 'A bowl of fresh vegetables',
  },
  {
    photo: 'waste',
    tag: 'Waste',
    color: 'var(--cat-waste)',
    title: 'What we throw away',
    caption:
      'Waste in landfill rots and releases methane. Recycling the same kilogram avoids most of that — one of the cheapest reductions anyone can make.',
    alt: 'Discarded plastic waste floating in the ocean',
  },
  {
    photo: 'water',
    tag: 'Water',
    color: 'var(--cat-water)',
    title: 'The energy behind your tap',
    caption:
      'Water itself emits nothing — its footprint is the electricity used to pump, treat and deliver it. Small per litre, but it adds up across a household.',
    alt: 'Water running from a tap',
  },
  {
    photo: 'electronics',
    tag: 'Consumption',
    color: 'var(--cat-consumption)',
    title: 'The carbon you buy',
    caption:
      'Most of a product’s carbon is spent making and shipping it, long before you own it. A single gadget can outweigh a month of commuting.',
    alt: 'A close-up of a green computer circuit board',
  },
  {
    photo: 'wind',
    tag: 'Renewables',
    color: 'var(--eco-purple)',
    title: 'Cleaner power is possible',
    caption:
      'Wind now undercuts fossil fuels on price across much of the world. The faster grids switch, the lighter every kilowatt-hour becomes.',
    alt: 'Wind turbines standing in a green field',
  },
  {
    photo: 'solar',
    tag: 'Solar',
    color: 'var(--cat-electricity)',
    title: 'The clean-energy shift',
    caption:
      'A field or rooftop of panels can cover real demand. Multiplied across millions of installations, that is a serious dent in national emissions.',
    alt: 'Rows of solar panels in a green field',
  },
];

/** One alternating image/text row of the essay. */
function EssayRow({ panel, index, reducedMotion }) {
  // Even rows: image left, text right. Odd rows: the reverse.
  const flipped = index % 2 === 1;
  const number = String(index + 1).padStart(2, '0');

  return (
    <motion.article
      initial={reducedMotion ? false : { opacity: 0, y: 44 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: false, amount: 0.25 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: 'clamp(1.5rem, 4vw, 3.5rem)',
        alignItems: 'center',
      }}
    >
      {/* the plate. It had the full card radius and the layered card shadow,
          which framed a photograph as a floating UI object. A photograph on
          paper does not cast a shadow. */}
      <div
        className="eco-photo-zoom"
        style={{
          order: flipped ? 2 : 1,
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 'var(--eco-radius-sm)',
          minHeight: 'clamp(280px, 40vw, 440px)',
        }}
      >
        <Photo
          id={PHOTOS[panel.photo]}
          alt={panel.alt}
          width={1100}
          color={panel.color}
          className="eco-photo-cover"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />
      </div>

      {/* text */}
      <div
        style={{
          order: flipped ? 1 : 2,
          paddingTop: '1.05rem',
          borderTop: '1px solid var(--rule-strong)',
        }}
      >
        {/* The index was a 4.4rem Space Grotesk numeral in the panel's colour at
            28% opacity - decoration behaving as texture, and a number wearing
            the colour of the thing it counts. It is a reading now: mono, amber,
            small, the same mark the calibration rail carries. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.6rem',
            marginBottom: '1.1rem',
          }}
        >
          <span className="eco-readout" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
            {number}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.55rem' }}>
            <span className="eco-marker">{panel.tag}</span>
            <span
              aria-hidden="true"
              style={{ width: 7, height: 7, borderRadius: 2, background: panel.color, flexShrink: 0 }}
            />
          </span>
        </div>

        <h2
          className="eco-display"
          style={{ fontSize: 'clamp(1.7rem, 3.8vw, 2.6rem)', margin: '0 0 1rem' }}
        >
          {panel.title}
        </h2>

        <p className="eco-text-muted" style={{ fontSize: '1rem', lineHeight: 1.75, margin: 0, maxWidth: '46ch' }}>
          {panel.caption}
        </p>
      </div>
    </motion.article>
  );
}

export default function Gallery() {
  const { prefersReducedMotion } = useTheme();

  return (
    <div style={{ paddingBottom: '5rem' }}>
      {/* ---------- editorial opener ---------- */}
      <div className="container" style={{ paddingTop: 'clamp(2.5rem, 7vw, 4rem)' }}>
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          style={{ maxWidth: 940, marginBottom: '2.6rem' }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.85rem',
              flexWrap: 'wrap',
              marginBottom: '2rem',
            }}
          >
            <span className="eco-marker">Photo essay</span>
            <span className="eco-readout" style={{ fontSize: '0.86rem', fontWeight: 600 }}>
              {String(PANELS.length).padStart(2, '0')} PLATES
            </span>
            <span className="eco-marker" style={{ opacity: 0.6 }}>sources, then the ways out</span>
            <span style={{ width: 46, height: 1, background: 'var(--rule-strong)' }} />
          </div>

          <h1
            className="eco-display"
            style={{ fontSize: 'clamp(2.4rem, 7.5vw, 4.8rem)', margin: '0 0 1.3rem' }}
          >
            The world <span className="eco-gradient-text">behind the numbers</span>
          </h1>
          <p
            className="eco-text-muted"
            style={{ fontSize: 'clamp(1rem, 2.2vw, 1.15rem)', lineHeight: 1.7, margin: 0, maxWidth: '54ch' }}
          >
            A photographic tour of where carbon comes from — and where it is already
            being cut. Real places, real systems, all connected to the choices EcoTrack
            helps you measure.
          </p>
        </motion.div>
      </div>

      {/* ---------- full-bleed featured plate ---------- */}
      {/* The opener used to carry its title and caption in white type over a
          gradient scrim that took the bottom of the photograph to 82% black.
          The scrim existed only so the words would be legible; moving them
          below gives the photograph back and puts the caption where a caption
          belongs. */}
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        className="eco-photo-zoom"
        style={{
          position: 'relative',
          overflow: 'hidden',
          height: 'clamp(340px, 55vh, 560px)',
        }}
      >
        <Photo
          id={PHOTOS[FEATURED.photo]}
          alt={FEATURED.alt}
          width={2000}
          color={FEATURED.color}
          className="eco-photo-cover"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />
      </motion.div>

      <div className="container" style={{ marginBottom: 'clamp(3rem, 8vw, 6rem)' }}>
        <div
          style={{
            maxWidth: 720,
            marginTop: '1.2rem',
            paddingTop: '0.9rem',
            borderTop: '1px solid var(--rule-strong)',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.55rem',
              marginBottom: '0.9rem',
            }}
          >
            <span
              aria-hidden="true"
              style={{ width: 7, height: 7, borderRadius: 2, background: FEATURED.color, flexShrink: 0 }}
            />
            <span className="eco-marker">{FEATURED.tag}</span>
          </div>
          <h2
            className="eco-display"
            style={{ fontSize: 'clamp(1.9rem, 5vw, 3.2rem)', margin: '0 0 0.9rem' }}
          >
            {FEATURED.title}
          </h2>
          <p className="eco-text-muted" style={{ fontSize: '1.02rem', lineHeight: 1.7, margin: 0 }}>
            {FEATURED.caption}
          </p>
        </div>
      </div>

      {/* ---------- the essay ---------- */}
      <div className="container" style={{ display: 'grid', gap: 'clamp(3rem, 9vw, 7rem)' }}>
        {PANELS.map((panel, index) => (
          <EssayRow key={panel.photo} panel={panel} index={index} reducedMotion={prefersReducedMotion} />
        ))}
      </div>

      {/* ---------- closing ---------- */}
      <div className="container" style={{ marginTop: 'clamp(3.5rem, 9vw, 6rem)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: '2rem',
            flexWrap: 'wrap',
            paddingTop: '1.1rem',
            borderTop: '1px solid var(--rule-strong)',
          }}
        >
          <div style={{ maxWidth: 560 }}>
            <h2
              className="eco-display"
              style={{ fontSize: 'clamp(1.7rem, 4vw, 2.6rem)', margin: '0 0 0.7rem' }}
            >
              Your choices are part of <span className="eco-gradient-text">this picture</span>
            </h2>
            <p className="eco-text-muted" style={{ margin: 0, fontSize: '0.95rem' }}>
              Every system on this page is one of the seven categories EcoTrack measures.
            </p>
          </div>
          <Link
            to="/register"
            className="eco-btn eco-btn-primary"
            style={{ padding: '0.9rem 2rem', flexShrink: 0 }}
          >
            Start tracking free
            <ArrowRight size={17} />
          </Link>
        </div>
      </div>
    </div>
  );
}
