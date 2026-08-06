// EcoTrack/frontend/src/pages/Learn.jsx
// Public "learn" section - short, sourced explainers about carbon, each one
// paired with a real photo, a small chart of the factors it discusses, and a
// one-line takeaway. Static content (honest: a curated set of explainers, not a
// live blog/CMS).
//
// Restyled into the instrument system. The explainers were cards with scrimmed
// photo panels and a pill tag stamped on the image; they are channels now, each
// hanging off its own rule with the plate captioned beside it. Every figure in
// the factor charts is a mono amber readout rather than bold text tinted the
// same colour as the bar it sits next to - a measurement never borrows the
// colour of the thing it measures.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, ChevronDown, TrendingDown } from 'lucide-react';

import Photo from '../components/Photo';
import { PHOTOS } from '../utils/photos';
import { useTheme } from '../context/ThemeContext';

// Headline figures pulled straight from the explainers below - the striking
// numbers up front, before anyone has to read a word. Each carries its unit and
// its source, because that is what turns a number into a reading.
const LEARN_STATS = [
  { value: '0.141', label: 'Petrol car', note: 'kg CO₂ per km · DEFRA' },
  { value: '14×', label: 'Solar vs the grid', note: 'cleaner per unit · CEA' },
  { value: '48 kg', label: 'One veg meal a day', note: 'saved per month · OWID' },
  { value: '85 kg', label: 'Hidden in one gadget', note: 'embedded carbon · EPA' },
];

// Each explainer carries a lede, the full text, a small set of factors to chart,
// and a one-line takeaway. The chart numbers are the SAME published factors the
// Calculator uses, so nothing here contradicts what the app actually applies.
//
// The accents were hardcoded dark-theme hexes (#4fbe80, #e0a23f, #a4739e,
// #d9694e) and are now the theme-aware category variables - the same accent the
// category carries everywhere else in the app, at a value measured for whichever
// theme is on.
const ARTICLES = [
  {
    photo: 'traffic3',
    alt: 'An aerial shot of vehicles on a road',
    accent: 'var(--cat-transport)',
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
    accent: 'var(--cat-electricity)',
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
    accent: 'var(--cat-diet)',
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
    accent: 'var(--cat-consumption)',
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
      <div className="eco-marker" style={{ display: 'block', marginBottom: '0.8rem' }}>
        {unit}
      </div>
      <div style={{ display: 'grid', gap: '0.7rem' }}>
        {bars.map((bar) => (
          <div key={bar.label} style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
            <span style={{ fontSize: '0.82rem', width: 108, flexShrink: 0 }}>{bar.label}</span>
            {/* Square-ended on a hairline track. The 999px pills read as UI
                chrome; a plotted bar on a rule reads as a measurement. */}
            <div style={{ flex: 1, height: 6, background: 'var(--rule)', overflow: 'hidden' }}>
              <motion.div
                initial={reducedMotion ? false : { width: 0 }}
                whileInView={{ width: `${Math.max((bar.value / max) * 100, 2)}%` }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                style={{ height: '100%', background: accent }}
              />
            </div>
            <span
              className="eco-readout"
              style={{ fontSize: '0.82rem', width: 46, textAlign: 'right', flexShrink: 0, fontWeight: 500 }}
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
    <motion.article
      initial={prefersReducedMotion ? false : { opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: false, amount: 0.15 }}
      transition={{ duration: 0.55, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      // A channel, not a card. The rule takes the category's accent, which is
      // what the pill stamped on the photograph used to do - except the rule
      // does not sit on top of the image to do it.
      style={{ paddingTop: '1.1rem', borderTop: `1px solid ${article.accent}` }}
    >
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
          {String(index + 1).padStart(2, '0')}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.55rem' }}>
          <span className="eco-marker">{article.tag}</span>
          <span
            aria-hidden="true"
            style={{ width: 7, height: 7, borderRadius: 2, background: article.accent, flexShrink: 0 }}
          />
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))',
          gap: 'clamp(1.2rem, 3vw, 2.2rem)',
          alignItems: 'start',
        }}
      >
        {/* the plate. The gradient scrim across its bottom and the accent pill
            in its corner are gone - both existed to put type on top of a
            photograph, which is the one thing this system does not do. */}
        <div
          className="eco-photo-zoom"
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: 'var(--eco-radius-sm)',
            aspectRatio: '4 / 3',
          }}
        >
          <Photo
            id={PHOTOS[article.photo]}
            alt={article.alt}
            width={720}
            color={article.accent}
            className="eco-photo-cover"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          />
        </div>

        {/* text + data */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h2
            className="eco-display"
            style={{ fontSize: 'clamp(1.3rem, 2.6vw, 1.7rem)', margin: '0 0 0.6rem' }}
          >
            {article.title}
          </h2>
          <p className="eco-text-muted" style={{ fontSize: '0.92rem', lineHeight: 1.6, margin: '0 0 1.4rem' }}>
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
                <p style={{ fontSize: '0.92rem', lineHeight: 1.75, margin: '1.4rem 0 0' }}>{article.body}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* the takeaway. Was a tinted, bordered, rounded box - a callout
              component. It is a pull quote: the one sentence worth carrying
              away from the explainer, marked by a rule down its edge. */}
          <div
            style={{
              display: 'flex',
              gap: '0.65rem',
              alignItems: 'flex-start',
              marginTop: '1.4rem',
              paddingLeft: '0.9rem',
              borderLeft: '2px solid var(--eco-primary)',
            }}
          >
            <TrendingDown size={16} style={{ color: 'var(--eco-primary)', flexShrink: 0, marginTop: 3 }} />
            <span style={{ fontSize: '0.9rem', lineHeight: 1.55 }}>{article.takeaway}</span>
          </div>

          <div
            style={{
              marginTop: '1.4rem',
              paddingTop: '0.9rem',
              borderTop: '1px solid var(--rule)',
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
            <span className="eco-marker" style={{ fontSize: '0.64rem' }}>
              {article.source}
            </span>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

export default function Learn() {
  const { prefersReducedMotion } = useTheme();
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div style={{ paddingBottom: '4rem' }}>
      {/* ---------- hero ---------- */}
      <section style={{ padding: 'clamp(2.5rem, 7vw, 4.5rem) 0 clamp(1.5rem, 4vw, 2.5rem)' }}>
        <div className="container">
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            style={{ maxWidth: 940 }}
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
              <span className="eco-marker">Explainers</span>
              <span className="eco-readout" style={{ fontSize: '0.86rem', fontWeight: 600 }}>
                {String(ARTICLES.length).padStart(2, '0')}
              </span>
              <span className="eco-marker" style={{ opacity: 0.6 }}>every figure sourced</span>
              <span style={{ width: 46, height: 1, background: 'var(--rule-strong)' }} />
            </div>

            <h1
              className="eco-display"
              style={{ fontSize: 'clamp(2.4rem, 7.5vw, 4.6rem)', margin: '0 0 1.3rem' }}
            >
              Understand your <span className="eco-gradient-text">carbon footprint</span>
            </h1>
            <p
              className="eco-text-muted"
              style={{ fontSize: 'clamp(1rem, 2.2vw, 1.15rem)', maxWidth: '54ch', margin: 0 }}
            >
              Short, sourced explainers — with the real numbers — on where emissions come
              from and the changes that actually move the needle.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ---------- by the numbers ---------- */}
      <section className="container" style={{ marginBottom: 'clamp(3rem, 7vw, 4.5rem)' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: '1.8rem',
          }}
        >
          {LEARN_STATS.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.45, delay: index * 0.07 }}
              style={{ paddingTop: '0.95rem', borderTop: '1px solid var(--rule-strong)' }}
            >
              <div
                className="eco-readout"
                style={{
                  fontSize: 'clamp(1.5rem, 3.4vw, 2.2rem)',
                  fontWeight: 500,
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {stat.value}
              </div>
              <div
                className="eco-marker"
                style={{ marginTop: '0.6rem', display: 'block', letterSpacing: '0.1em' }}
              >
                {stat.label}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.68rem',
                  marginTop: '0.25rem',
                  color: 'var(--eco-text-muted)',
                  opacity: 0.7,
                }}
              >
                {stat.note}
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ---------- the explainers ---------- */}
      <div className="container" style={{ display: 'grid', gap: 'clamp(2.5rem, 6vw, 4rem)' }}>
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

      {/* ---------- CTA ---------- */}
      <div className="container" style={{ marginTop: 'clamp(3rem, 7vw, 4.5rem)' }}>
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
              style={{ fontSize: 'clamp(1.6rem, 3.6vw, 2.4rem)', margin: '0 0 0.7rem' }}
            >
              Ready to measure <span className="eco-gradient-text">your own?</span>
            </h2>
            <p className="eco-text-muted" style={{ margin: 0, fontSize: '0.95rem' }}>
              These are the same factors EcoTrack applies to every activity you log.
            </p>
          </div>
          <Link
            to="/register"
            className="eco-btn eco-btn-primary"
            style={{ padding: '0.85rem 1.9rem', flexShrink: 0 }}
          >
            Start tracking free
            <ArrowRight size={17} />
          </Link>
        </div>
      </div>
    </div>
  );
}
