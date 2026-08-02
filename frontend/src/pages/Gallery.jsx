// EcoTrack/frontend/src/pages/Gallery.jsx
// Public "gallery" - an editorial photo essay on the systems behind the carbon
// numbers. Real photographs (see utils/photos.js). A full-bleed opener, then
// alternating image/text rows with large index numerals and generous
// whitespace; each row reveals as it scrolls in. Every card falls back to a
// themed gradient if its photo ever fails to load.

import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, ImageIcon } from 'lucide-react';

import Photo from '../components/Photo';
import { PHOTOS } from '../utils/photos';
import { useTheme } from '../context/ThemeContext';

// The full-bleed opener.
const FEATURED = {
  photo: 'forest',
  tag: 'Our planet',
  color: '#00c96b',
  title: 'One planet, one atmosphere',
  caption:
    'Every tonne of CO₂ we emit ends up in the same shared sky. These are the systems your everyday choices connect to — and the ones we can still change.',
  alt: 'Aerial view of a road winding through dense green forest',
};

// The essay: the sources of carbon, then the ways out.
const PANELS = [
  {
    photo: 'factory',
    tag: 'Industry',
    color: '#a4739e',
    title: 'Industry & manufacturing',
    caption:
      'Steel, cement and chemicals are carbon-heavy to make — around a fifth of global emissions are spent producing goods before they are ever used.',
    alt: 'Factories releasing smoke under a cloudy sky',
  },
  {
    photo: 'traffic',
    tag: 'Transport',
    color: '#4fbe80',
    title: 'Roads & the daily commute',
    caption:
      'Cars, buses, trains and flights are roughly a quarter of energy-related emissions, and the fastest-growing source in most countries.',
    alt: 'Aerial photograph of a busy multi-lane road full of cars',
  },
  {
    photo: 'powerPlant',
    tag: 'Energy',
    color: '#e0a23f',
    title: 'The grid that powers us',
    caption:
      'Electricity and heat are the single largest source worldwide. On a coal-heavy grid like India’s, every unit of power carries a heavy carbon cost.',
    alt: 'Power-station smokestacks beside a body of water',
  },
  {
    photo: 'meal',
    tag: 'Diet',
    color: '#cf7d95',
    title: 'The carbon on your plate',
    caption:
      'Food carries the emissions of everything that produced it. A meat meal averages three times the carbon of a vegan one — one of the easiest swaps to make.',
    alt: 'A bowl of fresh vegetables',
  },
  {
    photo: 'waste',
    tag: 'Waste',
    color: '#8f9a86',
    title: 'What we throw away',
    caption:
      'Waste in landfill rots and releases methane. Recycling the same kilogram avoids most of that — one of the cheapest reductions anyone can make.',
    alt: 'Discarded plastic waste floating in the ocean',
  },
  {
    photo: 'water',
    tag: 'Water',
    color: '#4a9dc4',
    title: 'The energy behind your tap',
    caption:
      'Water itself emits nothing — its footprint is the electricity used to pump, treat and deliver it. Small per litre, but it adds up across a household.',
    alt: 'Water running from a tap',
  },
  {
    photo: 'electronics',
    tag: 'Consumption',
    color: '#d9694e',
    title: 'The carbon you buy',
    caption:
      'Most of a product’s carbon is spent making and shipping it, long before you own it. A single gadget can outweigh a month of commuting.',
    alt: 'A close-up of a green computer circuit board',
  },
  {
    photo: 'wind',
    tag: 'Renewables',
    color: '#3fb0a8',
    title: 'Cleaner power is possible',
    caption:
      'Wind now undercuts fossil fuels on price across much of the world. The faster grids switch, the lighter every kilowatt-hour becomes.',
    alt: 'Wind turbines standing in a green field',
  },
  {
    photo: 'solar',
    tag: 'Solar',
    color: '#e0a23f',
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
      {/* image */}
      <div
        className="eco-photo-zoom"
        style={{
          order: flipped ? 2 : 1,
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 'var(--eco-radius)',
          minHeight: 'clamp(280px, 40vw, 440px)',
          boxShadow: 'var(--eco-shadow)',
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
      <div style={{ order: flipped ? 1 : 2, padding: '0 0.4rem' }}>
        <div
          style={{
            fontFamily: 'Space Grotesk, sans-serif',
            fontWeight: 700,
            fontSize: 'clamp(2.6rem, 7vw, 4.4rem)',
            lineHeight: 0.9,
            color: panel.color,
            opacity: 0.28,
            marginBottom: '0.6rem',
          }}
        >
          {number}
        </div>

        <span
          style={{
            display: 'inline-block',
            fontSize: '0.72rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.14em',
            color: panel.color,
            marginBottom: '0.9rem',
          }}
        >
          {panel.tag}
        </span>

        <h2 style={{ fontSize: 'clamp(1.6rem, 3.6vw, 2.4rem)', lineHeight: 1.12, margin: '0 0 1rem' }}>
          {panel.title}
        </h2>

        <p className="eco-text-muted" style={{ fontSize: '1.02rem', lineHeight: 1.75, margin: 0, maxWidth: 460 }}>
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
      <div className="container" style={{ paddingTop: '3rem', maxWidth: 1100 }}>
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          style={{ maxWidth: 760, marginBottom: '2.4rem' }}
        >
          <span className="eco-badge" style={{ marginBottom: '1.2rem' }}>
            <ImageIcon size={14} style={{ color: 'var(--eco-primary)' }} />
            Gallery
          </span>
          <h1 style={{ fontSize: 'clamp(2.4rem, 7vw, 4.2rem)', lineHeight: 1.02, margin: '0 0 1.1rem' }}>
            The world <span className="eco-gradient-text">behind the numbers</span>
          </h1>
          <p className="eco-text-muted" style={{ fontSize: '1.1rem', lineHeight: 1.7, margin: 0, maxWidth: 620 }}>
            A photographic tour of where carbon comes from — and where it is already
            being cut. Real places, real systems, all connected to the choices EcoTrack
            helps you measure.
          </p>
        </motion.div>
      </div>

      {/* ---------- full-bleed featured image ---------- */}
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        className="eco-photo-zoom"
        style={{
          position: 'relative',
          overflow: 'hidden',
          height: 'clamp(340px, 55vh, 560px)',
          margin: '0 0 clamp(3rem, 8vw, 6rem)',
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
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.25) 50%, rgba(0,0,0,0.1) 100%)',
          }}
        />
        <div
          className="container"
          style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: 'clamp(2rem, 5vw, 3.5rem)' }}
        >
          <div style={{ maxWidth: 640 }}>
            <span
              style={{
                display: 'inline-block',
                background: FEATURED.color,
                color: '#04140c',
                fontSize: '0.7rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                padding: '0.28rem 0.75rem',
                borderRadius: 999,
                marginBottom: '1rem',
              }}
            >
              {FEATURED.tag}
            </span>
            <h2 style={{ color: '#fff', fontSize: 'clamp(1.9rem, 5vw, 3.2rem)', lineHeight: 1.05, margin: '0 0 0.9rem' }}>
              {FEATURED.title}
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.88)', fontSize: '1.05rem', lineHeight: 1.7, margin: 0 }}>
              {FEATURED.caption}
            </p>
          </div>
        </div>
      </motion.div>

      {/* ---------- the essay ---------- */}
      <div
        className="container"
        style={{ maxWidth: 1100, display: 'grid', gap: 'clamp(3rem, 9vw, 7rem)' }}
      >
        {PANELS.map((panel, index) => (
          <EssayRow key={panel.photo} panel={panel} index={index} reducedMotion={prefersReducedMotion} />
        ))}
      </div>

      {/* ---------- closing ---------- */}
      <div className="container" style={{ textAlign: 'center', marginTop: 'clamp(3.5rem, 9vw, 6rem)' }}>
        <h2 style={{ fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', marginBottom: '1.1rem' }}>
          Your choices are part of <span className="eco-gradient-text">this picture</span>
        </h2>
        <Link to="/register" className="eco-btn eco-btn-primary" style={{ padding: '0.9rem 2rem' }}>
          Start tracking free
          <ArrowRight size={17} />
        </Link>
      </div>
    </div>
  );
}
