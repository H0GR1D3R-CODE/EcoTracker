// EcoTrack/frontend/src/pages/Learn.jsx
// Public "learn" section - short, sourced explainers about carbon, each one
// paired with a real photo, a small animated chart of the factors it discusses,
// and a one-line takeaway. Static content (honest: a curated set of explainers,
// not a live blog/CMS).

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, BookOpen, ChevronDown, TrendingDown } from 'lucide-react';

import Photo from '../components/Photo';
import { PHOTOS } from '../utils/photos';
import { useTheme } from '../context/ThemeContext';

// Headline figures pulled straight from the explainers below - the striking
// numbers up front, before anyone has to read a word.
const LEARN_STATS = [
  { value: '0.141', unit: 'kg/km', label: 'CO₂ from a petrol car' },
  { value: '14×', unit: '', label: 'cleaner: solar vs India’s grid' },
  { value: '48 kg', unit: '/mo', label: 'saved by one veg meal a day' },
  { value: '85 kg', unit: '', label: 'hidden in one small gadget' },
];

// Each explainer carries a lede, the full text, a small set of factors to chart,
// and a one-line takeaway. The chart numbers are the SAME published factors the
// Calculator uses, so nothing here contradicts what the app actually applies.
const ARTICLES = [
  {
    photo: 'traffic3',
    alt: 'An aerial shot of vehicles on a road',
    accent: '#4fbe80',
    tag: 'Transport',
    title: 'Why how you travel matters more than how far',
    lede: 'The same journey can cost wildly different amounts of carbon depending on the mode.',
    unit: 'kg CO₂ per km',
    bars: [
      { label: 'Petrol car', value: 0.141 },
      { label: 'Bus', value: 0.082 },
      { label: 'Train', value: 0.041 },
      { label: 'Bicycle', value: 0.0 },
    ],
    body: 'A petrol car emits about 0.141 kg of CO₂ per kilometre; a train seat is 0.041 and a bus 0.082. Cycling is zero. That means swapping one short car trip a week for the train or bus removes most of that journey’s carbon — without you travelling any less. Transport is roughly a quarter of energy-related emissions worldwide, and the fastest-growing source, so this is often the single most effective place to start.',
    // 70%, not 80%. (0.141 - 0.041) / 0.141 = 70.9%, straight from the two
    // DEFRA factors this page already quotes two sentences earlier.
    takeaway: 'Swap one weekly car trip for the train and you cut ~70% of that journey’s carbon.',
    source: 'DEFRA 2023 · IEA',
  },
  {
    photo: 'powerPlant3',
    alt: 'High-voltage electricity transmission towers',
    accent: '#e0a23f',
    tag: 'Electricity',
    title: 'Why electricity is not "clean" everywhere',
    lede: 'A kilowatt-hour in India carries far more carbon than one in Norway.',
    unit: 'kg CO₂ per unit',
    bars: [
      { label: 'India grid', value: 0.71 },
      { label: 'Rooftop solar', value: 0.05 },
    ],
    body: 'India’s grid emits about 0.710 kg of CO₂ per unit because so much of it still burns coal — among the highest figures anywhere. The same fridge or air conditioner therefore has a much larger footprint here than in a country running on hydro or nuclear. Rooftop solar is roughly fourteen times cleaner per unit, which is why where your power comes from matters as much as how much you use.',
    takeaway: 'Where your power comes from matters as much as how much you use.',
    source: 'CEA India 2023',
  },
  {
    photo: 'meal2',
    alt: 'A fresh vegetable salad',
    accent: '#a4739e',
    tag: 'Diet',
    title: 'The carbon on your plate',
    lede: 'Food, especially meat, carries the emissions of everything that produced it.',
    unit: 'kg CO₂ per meal',
    bars: [
      { label: 'Non-vegetarian', value: 3.3 },
      { label: 'Vegetarian', value: 1.7 },
      { label: 'Vegan', value: 1.1 },
    ],
    body: 'A non-vegetarian meal averages about 3.3 kg of CO₂, a vegetarian one 1.7, and a vegan one 1.1. Meat is higher because it carries the emissions of the land, feed and animals behind it. Swapping one meat meal a day for a vegetarian option saves close to 48 kg of CO₂ a month — one of the largest reductions available without changing anything else about your life.',
    takeaway: 'One veg meal a day instead of meat ≈ 48 kg CO₂ saved every month.',
    source: 'Our World in Data',
  },
  {
    photo: 'electronics2',
    alt: 'Assorted electronic devices',
    accent: '#d9694e',
    tag: 'Consumption',
    title: 'The footprint you pay for before you buy',
    lede: 'Most of a product’s carbon is spent making it, long before it reaches you.',
    unit: 'kg CO₂ embedded',
    bars: [
      { label: 'Electronic item', value: 85 },
      { label: 'Garment', value: 8 },
    ],
    body: 'A single small electronic item carries around 85 kg of embedded CO₂ from mining, manufacturing and shipping. A garment averages 8 kg. This "embedded" carbon is why repairing or buying used matters so much — it avoids almost the entire footprint of making something new. Industry is about a fifth of global emissions, much of it spent on goods before they are ever used.',
    takeaway: 'Repairing or buying used avoids almost the entire making-footprint.',
    source: 'EPA · lifecycle averages',
  },
];

/** A tiny bar chart of an article's factors — the numbers, made visual. */
function FactorBars({ bars, unit, accent, reducedMotion }) {
  const max = Math.max(...bars.map((bar) => bar.value)) || 1;

  return (
    <div>
      <div
        className="eco-text-muted"
        style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.7rem' }}
      >
        {unit}
      </div>
      <div style={{ display: 'grid', gap: '0.6rem' }}>
        {bars.map((bar) => (
          <div key={bar.label} style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
            <span style={{ fontSize: '0.82rem', width: 108, flexShrink: 0 }}>{bar.label}</span>
            <div style={{ flex: 1, height: 9, borderRadius: 999, background: 'var(--eco-border)', overflow: 'hidden' }}>
              <motion.div
                initial={reducedMotion ? false : { width: 0 }}
                whileInView={{ width: `${Math.max((bar.value / max) * 100, 3)}%` }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                style={{ height: '100%', borderRadius: 999, background: accent }}
              />
            </div>
            <span
              className="eco-tabular"
              style={{ fontSize: '0.8rem', width: 44, textAlign: 'right', flexShrink: 0, fontWeight: 700, color: accent }}
            >
              {bar.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Article({ article, index, open, onToggle }) {
  const { prefersReducedMotion } = useTheme();

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: false, amount: 0.15 }}
      transition={{ duration: 0.55, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className="eco-card"
      style={{ overflow: 'hidden', padding: 0 }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {/* photo panel */}
        <div className="eco-photo-zoom" style={{ position: 'relative', overflow: 'hidden', minHeight: 240 }}>
          <Photo
            id={PHOTOS[article.photo]}
            alt={article.alt}
            width={720}
            color={article.accent}
            className="eco-photo-cover"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(to top, rgba(0,0,0,0.55), transparent 55%)',
            }}
          />
          <span
            style={{
              position: 'absolute',
              top: '1.1rem',
              left: '1.1rem',
              background: article.accent,
              color: '#04140c',
              fontSize: '0.68rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              padding: '0.25rem 0.7rem',
              borderRadius: 999,
            }}
          >
            {article.tag}
          </span>
        </div>

        {/* text + data panel */}
        <div style={{ padding: '1.6rem', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ fontSize: 'clamp(1.2rem, 2.4vw, 1.5rem)', marginBottom: '0.5rem', lineHeight: 1.25 }}>
            {article.title}
          </h2>
          <p className="eco-text-muted" style={{ fontSize: '0.92rem', lineHeight: 1.6, margin: '0 0 1.3rem' }}>
            {article.lede}
          </p>

          {/* the factors, as a small chart */}
          <FactorBars
            bars={article.bars}
            unit={article.unit}
            accent={article.accent}
            reducedMotion={prefersReducedMotion}
          />

          {/* full text, expands in place */}
          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                style={{ overflow: 'hidden' }}
              >
                <p style={{ fontSize: '0.92rem', lineHeight: 1.75, margin: '1.3rem 0 0' }}>{article.body}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* takeaway highlight */}
          <div
            style={{
              display: 'flex',
              gap: '0.6rem',
              alignItems: 'flex-start',
              marginTop: '1.3rem',
              padding: '0.8rem 1rem',
              borderRadius: 'var(--eco-radius-sm)',
              background: 'rgba(var(--eco-primary-rgb), 0.07)',
              border: '1px solid rgba(var(--eco-primary-rgb), 0.18)',
            }}
          >
            <TrendingDown size={16} style={{ color: 'var(--eco-primary)', flexShrink: 0, marginTop: 2 }} />
            <span style={{ fontSize: '0.86rem', lineHeight: 1.5 }}>{article.takeaway}</span>
          </div>

          <div
            style={{
              marginTop: 'auto',
              paddingTop: '1.2rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.5rem',
            }}
          >
            <button
              type="button"
              onClick={onToggle}
              className="eco-btn eco-btn-ghost"
              style={{ fontSize: '0.82rem', padding: '0.4rem 0.85rem' }}
            >
              {open ? 'Show less' : 'Read more'}
              <ChevronDown
                size={15}
                style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.25s ease' }}
              />
            </button>
            <span className="eco-text-muted" style={{ fontSize: '0.72rem' }}>
              {article.source}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function Learn() {
  const { prefersReducedMotion } = useTheme();
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div className="container" style={{ paddingTop: '2.5rem', paddingBottom: '4rem', maxWidth: 960 }}>
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ textAlign: 'center', maxWidth: 660, margin: '0 auto 2.4rem' }}
      >
        <span className="eco-badge" style={{ marginBottom: '1rem' }}>
          <BookOpen size={14} style={{ color: 'var(--eco-primary)' }} />
          Learn
        </span>
        <h1 style={{ fontSize: 'clamp(2rem, 5.5vw, 3rem)', marginBottom: '0.9rem', lineHeight: 1.1 }}>
          Understand your <span className="eco-gradient-text">carbon footprint</span>
        </h1>
        <p className="eco-text-muted" style={{ fontSize: '1rem', lineHeight: 1.7, margin: 0 }}>
          Short, sourced explainers — with the real numbers — on where emissions come
          from and the changes that actually move the needle.
        </p>
      </motion.div>

      {/* by the numbers */}
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.5 }}
        className="eco-card"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '1rem',
          textAlign: 'center',
          marginBottom: '2.4rem',
        }}
      >
        {LEARN_STATS.map((stat) => (
          <div key={stat.label}>
            <div
              className="eco-gradient-text"
              style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '1.9rem', lineHeight: 1.05 }}
            >
              {stat.value}
              <span style={{ fontSize: '0.9rem' }}>{stat.unit}</span>
            </div>
            <div className="eco-text-muted" style={{ fontSize: '0.8rem', marginTop: '0.35rem', lineHeight: 1.4 }}>
              {stat.label}
            </div>
          </div>
        ))}
      </motion.div>

      <div style={{ display: 'grid', gap: '1.4rem' }}>
        {ARTICLES.map((article, index) => (
          <Article
            key={article.title}
            article={article}
            index={index}
            open={openIndex === index}
            onToggle={() => setOpenIndex(openIndex === index ? -1 : index)}
          />
        ))}
      </div>

      <div style={{ textAlign: 'center', marginTop: '2.8rem' }}>
        <p className="eco-text-muted" style={{ marginBottom: '1rem' }}>
          Ready to measure your own?
        </p>
        <Link to="/register" className="eco-btn eco-btn-primary" style={{ padding: '0.85rem 1.9rem' }}>
          Start tracking free
          <ArrowRight size={17} />
        </Link>
      </div>
    </div>
  );
}
