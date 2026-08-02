// EcoTrack/frontend/src/pages/Gallery.jsx
// Public "gallery" - a photographic tour of the systems behind the carbon
// numbers. Real photographs (see utils/photos.js), each with a caption on a
// dark scrim so the text stays readable over any image in either theme. Every
// card falls back to a themed gradient if its photo ever fails to load.

import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, ImageIcon } from 'lucide-react';

import Photo from '../components/Photo';
import { PHOTOS } from '../utils/photos';
import { useTheme } from '../context/ThemeContext';

// The featured banner across the top.
const FEATURED = {
  photo: 'forest',
  tag: 'Our planet',
  color: '#00c96b',
  title: 'One planet, one atmosphere',
  caption:
    'Every tonne of CO₂ we emit ends up in the same shared sky. These are the systems your everyday choices connect to — and the ones we can still change.',
  alt: 'Aerial view of a road winding through dense green forest',
};

// The story grid: the sources of carbon, then the ways out.
const PANELS = [
  {
    photo: 'factory',
    tag: 'Industry',
    color: '#7c3aed',
    title: 'Industry & manufacturing',
    caption:
      'Steel, cement and chemicals are carbon-heavy to make — around a fifth of global emissions are spent producing goods before they are ever used.',
    alt: 'Factories releasing smoke under a cloudy sky',
  },
  {
    photo: 'traffic',
    tag: 'Transport',
    color: '#00ff87',
    title: 'Roads & the daily commute',
    caption:
      'Cars, buses, trains and flights are roughly a quarter of energy-related emissions, and the fastest-growing source in most countries.',
    alt: 'Aerial photograph of a busy multi-lane road full of cars',
  },
  {
    photo: 'powerPlant',
    tag: 'Energy',
    color: '#f59e0b',
    title: 'The grid that powers us',
    caption:
      'Electricity and heat are the single largest source worldwide. On a coal-heavy grid like India’s, every unit of power carries a heavy carbon cost.',
    alt: 'Power-station smokestacks beside a body of water',
  },
  {
    photo: 'meal',
    tag: 'Diet',
    color: '#ec4899',
    title: 'The carbon on your plate',
    caption:
      'Food carries the emissions of everything that produced it. A meat meal averages three times the carbon of a vegan one — one of the easiest swaps to make.',
    alt: 'A bowl of fresh vegetables',
  },
  {
    photo: 'waste',
    tag: 'Waste',
    color: '#8888aa',
    title: 'What we throw away',
    caption:
      'Waste in landfill rots and releases methane. Recycling the same kilogram avoids most of that — one of the cheapest reductions anyone can make.',
    alt: 'Discarded plastic waste floating in the ocean',
  },
  {
    photo: 'water',
    tag: 'Water',
    color: '#0ea5e9',
    title: 'The energy behind your tap',
    caption:
      'Water itself emits nothing — its footprint is the electricity used to pump, treat and deliver it. Small per litre, but it adds up across a household.',
    alt: 'Water running from a tap',
  },
  {
    photo: 'electronics',
    tag: 'Consumption',
    color: '#f43f5e',
    title: 'The carbon you buy',
    caption:
      'Most of a product’s carbon is spent making and shipping it, long before you own it. A single gadget can outweigh a month of commuting.',
    alt: 'A close-up of a green computer circuit board',
  },
  {
    photo: 'wind',
    tag: 'Renewables',
    color: '#38bdf8',
    title: 'Cleaner power is possible',
    caption:
      'Wind now undercuts fossil fuels on price across much of the world. The faster grids switch, the lighter every kilowatt-hour becomes.',
    alt: 'Wind turbines standing in a green field',
  },
  {
    photo: 'solar',
    tag: 'Solar',
    color: '#eab308',
    title: 'The clean-energy shift',
    caption:
      'A field or rooftop of panels can cover real demand. Multiplied across millions of installations, that is a serious dent in national emissions.',
    alt: 'Rows of solar panels in a green field',
  },
];

/**
 * One photo card. The photograph fills the card; the caption sits on a dark
 * scrim over it so it reads in any theme. Reveals as it scrolls into view.
 */
function PhotoCard({ panel, featured = false, reducedMotion, index = 0 }) {
  return (
    <motion.article
      initial={reducedMotion ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className="eco-card eco-photo-card"
      style={{
        position: 'relative',
        overflow: 'hidden',
        padding: 0,
        minHeight: featured ? 340 : 300,
        gridColumn: featured ? '1 / -1' : 'auto',
        display: 'flex',
        alignItems: 'flex-end',
      }}
    >
      <Photo
        id={PHOTOS[panel.photo]}
        alt={panel.alt}
        width={featured ? 1600 : 820}
        color={panel.color}
        className="eco-photo-cover"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />

      {/* dark scrim so white caption text is always legible over any photo */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 45%, rgba(0,0,0,0.05) 100%)',
        }}
      />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          padding: featured ? '2rem' : '1.4rem',
          color: '#fff',
          maxWidth: featured ? 640 : 'none',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            background: panel.color,
            color: '#04140c',
            fontSize: '0.68rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            padding: '0.22rem 0.6rem',
            borderRadius: 999,
            marginBottom: '0.7rem',
          }}
        >
          {panel.tag}
        </span>
        <h2
          style={{
            color: '#fff',
            fontSize: featured ? 'clamp(1.6rem, 4vw, 2.1rem)' : '1.3rem',
            margin: '0 0 0.45rem',
          }}
        >
          {panel.title}
        </h2>
        <p
          style={{
            color: 'rgba(255,255,255,0.86)',
            fontSize: featured ? '1rem' : '0.9rem',
            lineHeight: 1.65,
            margin: 0,
          }}
        >
          {panel.caption}
        </p>
      </div>
    </motion.article>
  );
}

export default function Gallery() {
  const { prefersReducedMotion } = useTheme();

  return (
    <div className="container" style={{ paddingTop: '2.5rem', paddingBottom: '4rem', maxWidth: 1040 }}>
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 2.6rem' }}
      >
        <span className="eco-badge" style={{ marginBottom: '1rem' }}>
          <ImageIcon size={14} style={{ color: 'var(--eco-primary)' }} />
          Gallery
        </span>
        <h1 style={{ fontSize: 'clamp(2rem, 5vw, 2.8rem)', marginBottom: '0.9rem' }}>
          The world <span className="eco-gradient-text">behind the numbers</span>
        </h1>
        <p className="eco-text-muted" style={{ fontSize: '1rem', lineHeight: 1.7, margin: 0 }}>
          A photographic tour of where carbon comes from — and where it is
          already being cut. Real places, real systems, all connected to the
          choices EcoTrack helps you measure.
        </p>
      </motion.div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1.4rem',
        }}
      >
        <PhotoCard panel={FEATURED} featured reducedMotion={prefersReducedMotion} />
        {PANELS.map((panel, index) => (
          <PhotoCard
            key={panel.photo}
            panel={panel}
            index={index}
            reducedMotion={prefersReducedMotion}
          />
        ))}
      </div>

      <div style={{ textAlign: 'center', marginTop: '2.8rem' }}>
        <h2 style={{ fontSize: '1.4rem', marginBottom: '0.8rem' }}>
          Your choices are part of <span className="eco-gradient-text">this picture</span>
        </h2>
        <Link to="/register" className="eco-btn eco-btn-primary" style={{ padding: '0.85rem 1.9rem' }}>
          Start tracking free
          <ArrowRight size={17} />
        </Link>
      </div>
    </div>
  );
}
