// EcoTrack/frontend/src/pages/Learn.jsx
// Public "learn" section - short, sourced articles about carbon. Static content
// (honest: this is a curated set of explainers, not a live blog/CMS).

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, BookOpen, ChevronDown } from 'lucide-react';

import Photo from '../components/Photo';
import { PHOTOS } from '../utils/photos';
import { useTheme } from '../context/ThemeContext';

// Each article is an explainer with a source. Kept short and factual - the goal
// is a reader who understands their footprint a little better, not a wall of text.
const ARTICLES = [
  {
    photo: 'traffic3',
    alt: 'An aerial shot of vehicles on a road',
    title: 'Why how you travel matters more than how far',
    lede: 'The same journey can cost wildly different amounts of carbon depending on the mode.',
    body: 'A petrol car emits about 0.141 kg of CO₂ per kilometre; a train seat is 0.041 and a bus 0.082. Cycling is zero. That means swapping one short car trip a week for the train or bus removes most of that journey’s carbon — without you travelling any less. Transport is roughly a quarter of energy-related emissions worldwide, and the fastest-growing source, so this is often the single most effective place to start.',
    source: 'DEFRA 2023 · IEA',
  },
  {
    photo: 'powerPlant3',
    alt: 'High-voltage electricity transmission towers',
    title: 'Why electricity is not "clean" everywhere',
    lede: 'A kilowatt-hour in India carries far more carbon than one in Norway.',
    body: 'India’s grid emits about 0.710 kg of CO₂ per unit because so much of it still burns coal — among the highest figures anywhere. The same fridge or air conditioner therefore has a much larger footprint here than in a country running on hydro or nuclear. Rooftop solar is roughly fourteen times cleaner per unit, which is why where your power comes from matters as much as how much you use.',
    source: 'CEA India 2023',
  },
  {
    photo: 'meal2',
    alt: 'A fresh vegetable salad',
    title: 'The carbon on your plate',
    lede: 'Food, especially meat, carries the emissions of everything that produced it.',
    body: 'A non-vegetarian meal averages about 3.3 kg of CO₂, a vegetarian one 1.7, and a vegan one 1.1. Meat is higher because it carries the emissions of the land, feed and animals behind it. Swapping one meat meal a day for a vegetarian option saves close to 48 kg of CO₂ a month — one of the largest reductions available without changing anything else about your life.',
    source: 'Our World in Data',
  },
  {
    photo: 'electronics2',
    alt: 'Assorted electronic devices',
    title: 'The footprint you pay for before you buy',
    lede: 'Most of a product’s carbon is spent making it, long before it reaches you.',
    body: 'A single small electronic item carries around 85 kg of embedded CO₂ from mining, manufacturing and shipping. A garment averages 8 kg. This "embedded" carbon is why repairing or buying used matters so much — it avoids almost the entire footprint of making something new. Industry is about a fifth of global emissions, much of it spent on goods before they are ever used.',
    source: 'EPA · lifecycle averages',
  },
];

function Article({ article, index, open, onToggle }) {
  const { prefersReducedMotion } = useTheme();

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: false, amount: 0.2 }}
      transition={{ duration: 0.5, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      className="eco-card"
      style={{ overflow: 'hidden' }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.2rem' }}>
        <div
          className="eco-photo-zoom"
          style={{ borderRadius: 'var(--eco-radius-sm)', overflow: 'hidden', minHeight: 160 }}
        >
          <Photo
            id={PHOTOS[article.photo]}
            alt={article.alt}
            width={560}
            className="eco-photo-cover"
            style={{ width: '100%', height: '100%', minHeight: 160, display: 'block' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ fontSize: '1.15rem', marginBottom: '0.4rem' }}>{article.title}</h2>
          <p className="eco-text-muted" style={{ fontSize: '0.9rem', lineHeight: 1.6, margin: '0 0 0.9rem' }}>
            {article.lede}
          </p>

          {/* The full text expands in place, so the page stays a scannable list
              of headlines until the reader chooses to go deeper */}
          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                style={{ overflow: 'hidden' }}
              >
                <p style={{ fontSize: '0.92rem', lineHeight: 1.75, margin: '0 0 0.9rem' }}>
                  {article.body}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <div
            style={{
              marginTop: 'auto',
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
    <div className="container" style={{ paddingTop: '2.5rem', paddingBottom: '4rem', maxWidth: 900 }}>
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 2.5rem' }}
      >
        <span className="eco-badge" style={{ marginBottom: '1rem' }}>
          <BookOpen size={14} style={{ color: 'var(--eco-primary)' }} />
          Learn
        </span>
        <h1 style={{ fontSize: 'clamp(2rem, 5vw, 2.8rem)', marginBottom: '0.9rem' }}>
          Understand your <span className="eco-gradient-text">carbon footprint</span>
        </h1>
        <p className="eco-text-muted" style={{ fontSize: '1rem', lineHeight: 1.7, margin: 0 }}>
          Short, sourced explainers on where emissions come from and the changes
          that actually move the needle.
        </p>
      </motion.div>

      <div style={{ display: 'grid', gap: '1.2rem' }}>
        {ARTICLES.map((article, index) => (
          <Article
            key={article.title}
            article={article}
            index={index}
            open={openIndex === index}
            // One open at a time keeps the page tidy; clicking the open one closes it
            onToggle={() => setOpenIndex(openIndex === index ? -1 : index)}
          />
        ))}
      </div>

      <div style={{ textAlign: 'center', marginTop: '2.5rem' }}>
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
