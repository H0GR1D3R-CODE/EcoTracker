// EcoTrack/frontend/src/pages/About.jsx
// Public "about" page - the project's mission, how it works, and the tech.
// Static content, so it needs no login and no backend.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  BarChart3,
  ChevronDown,
  Cloud,
  Cpu,
  HelpCircle,
  Leaf,
  LineChart,
  PlusCircle,
  ShieldCheck,
  Target,
} from 'lucide-react';

import Photo from '../components/Photo';
import { PHOTOS } from '../utils/photos';
import { useTheme } from '../context/ThemeContext';

// Headline figures for the band under the hero. These are facts about the
// project and the science, not live data - so they are safe to state plainly.
const STATS = [
  { value: '7', label: 'emission categories tracked' },
  { value: '1.5°C', label: 'the warming limit we aim to stay under' },
  { value: '~2 t', label: 'fair yearly footprint per person' },
  { value: '100%', label: 'figures traceable to a public source' },
];

// The whole product in three steps, shown as a numbered flow.
const STEPS = [
  {
    icon: PlusCircle,
    title: 'Log an activity',
    body: 'Enter something you actually did — a car trip, an electricity bill, a meal. It takes seconds, and one entry is enough to begin.',
  },
  {
    icon: BarChart3,
    title: 'See your footprint',
    body: 'Every entry becomes kilograms of CO₂ on your dashboard, split by category and tracked over time so trends are obvious.',
  },
  {
    icon: Target,
    title: 'Act on what matters',
    body: 'Set a reduction goal on your heaviest category and watch a live progress ring. Specific targets beat vague good intentions.',
  },
];

// Plain answers to the questions people actually ask about a footprint tracker.
const FAQS = [
  {
    q: 'Where do the numbers come from?',
    a: 'Every activity is multiplied by a published emission factor from DEFRA, the IPCC, the Central Electricity Authority of India, or Our World in Data. Nothing is estimated by us — each figure traces back to a source.',
  },
  {
    q: 'Is EcoTrack free?',
    a: 'Yes. Create an account and track as much as you like; there is nothing to pay and no card required.',
  },
  {
    q: 'Who can see my data?',
    a: 'Only you. Sign-in runs through Firebase Authentication, and the server verifies your identity on every request before any data is read or written.',
  },
  {
    q: 'Do I need to be perfectly accurate?',
    a: 'No. A reasonable estimate is enough to see where your footprint concentrates. The goal is direction and awareness, not decimal-perfect accounting.',
  },
];

const PRINCIPLES = [
  {
    icon: LineChart,
    title: 'Measure honestly',
    body: 'Every figure comes from a published emission factor — DEFRA, the IPCC, the Central Electricity Authority of India, Our World in Data. Nothing is invented, so every number can be traced to its source.',
  },
  {
    icon: Target,
    title: 'Act specifically',
    body: 'A single "reduce your emissions" target tells you nothing. EcoTrack breaks your footprint into seven categories and lets you set a goal on each, so you always know what to actually change.',
  },
  {
    icon: ShieldCheck,
    title: 'Respect privacy',
    body: 'Your data is yours. Sign-in runs through Firebase Authentication, and the server verifies your identity on every request before any data is read.',
  },
];

const STACK = [
  'React (Vite)',
  'Python Flask',
  'Firebase Auth',
  'Firestore',
  'Chart.js',
  'Google Gemini',
];

export default function About() {
  const { prefersReducedMotion } = useTheme();
  // Which FAQ answer is expanded (-1 = all closed). Starts with the first open.
  const [openFaq, setOpenFaq] = useState(0);

  return (
    <div className="container" style={{ paddingTop: '2.5rem', paddingBottom: '4rem', maxWidth: 940 }}>
      {/* ---------- hero ---------- */}
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{ textAlign: 'center', maxWidth: 680, margin: '0 auto 3rem' }}
      >
        <span className="eco-badge" style={{ marginBottom: '1.2rem' }}>
          <Cloud size={14} style={{ color: 'var(--eco-primary)' }} />
          UN SDG 13 · Climate Action
        </span>
        <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', marginBottom: '1rem' }}>
          About <span className="eco-gradient-text">EcoTrack</span>
        </h1>
        <p className="eco-text-muted" style={{ fontSize: '1.05rem', lineHeight: 1.7, margin: 0 }}>
          You cannot reduce what you never measure. EcoTrack exists to turn the
          vague worry of a personal carbon footprint into a real number you can
          see, understand, and bring down — one everyday choice at a time.
        </p>
      </motion.div>

      {/* ---------- stats band ---------- */}
      <div
        className="eco-card"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '1rem',
          textAlign: 'center',
          marginBottom: '2.5rem',
        }}
      >
        {STATS.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, amount: 0.25 }}
            transition={{ duration: 0.4, delay: index * 0.07 }}
          >
            <div
              className="eco-gradient-text"
              style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '1.9rem', lineHeight: 1.1 }}
            >
              {stat.value}
            </div>
            <div className="eco-text-muted" style={{ fontSize: '0.82rem', marginTop: '0.3rem', lineHeight: 1.4 }}>
              {stat.label}
            </div>
          </motion.div>
        ))}
      </div>

      {/* ---------- mission card with illustration ---------- */}
      <div
        className="eco-card"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '1.5rem',
          alignItems: 'center',
          marginBottom: '2.5rem',
        }}
      >
        <div>
          <h2 style={{ fontSize: '1.4rem', marginBottom: '0.8rem' }}>Why it exists</h2>
          <p className="eco-text-muted" style={{ lineHeight: 1.75, margin: 0 }}>
            Climate change can feel too big for one person to affect. But the
            average footprint is the sum of ordinary decisions — how you travel,
            what you eat, the power you use. EcoTrack makes those decisions
            visible so small, deliberate changes add up to something real, and
            ties every one of them back to the science behind it.
          </p>
        </div>
        <div
          className="eco-photo-zoom"
          style={{
            borderRadius: 'var(--eco-radius)',
            overflow: 'hidden',
            minHeight: 210,
            boxShadow: 'var(--eco-shadow)',
          }}
        >
          <Photo
            id={PHOTOS.seedling}
            alt="Hands cupping a small green seedling growing from soil"
            width={640}
            className="eco-photo-cover"
            style={{ width: '100%', height: '100%', minHeight: 210, display: 'block' }}
          />
        </div>
      </div>

      {/* ---------- how it works ---------- */}
      <h2 style={{ fontSize: '1.4rem', marginBottom: '1.3rem', textAlign: 'center' }}>
        How it works
      </h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
          gap: '1.2rem',
          marginBottom: '2.5rem',
        }}
      >
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          return (
            <motion.div
              key={step.title}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, amount: 0.25 }}
              transition={{ duration: 0.45, delay: index * 0.08 }}
              className="eco-card"
              style={{ position: 'relative' }}
            >
              {/* the step number, sitting in the top corner */}
              <span
                style={{
                  position: 'absolute',
                  top: '1.1rem',
                  right: '1.2rem',
                  fontFamily: 'Space Grotesk, sans-serif',
                  fontWeight: 700,
                  fontSize: '2rem',
                  color: 'var(--eco-border)',
                  lineHeight: 1,
                }}
              >
                {index + 1}
              </span>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(var(--eco-primary-rgb), 0.14)',
                  color: 'var(--eco-primary)',
                  marginBottom: '1rem',
                }}
              >
                <Icon size={22} />
              </div>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>{step.title}</h3>
              <p className="eco-text-muted" style={{ fontSize: '0.9rem', lineHeight: 1.65, margin: 0 }}>
                {step.body}
              </p>
            </motion.div>
          );
        })}
      </div>

      {/* ---------- principles ---------- */}
      <h2 style={{ fontSize: '1.4rem', marginBottom: '1.3rem', textAlign: 'center' }}>
        What EcoTrack stands for
      </h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '1.2rem',
          marginBottom: '2.5rem',
        }}
      >
        {PRINCIPLES.map((item, index) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={item.title}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, amount: 0.25 }}
              transition={{ duration: 0.45, delay: index * 0.08 }}
              className="eco-card eco-card-hover"
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(var(--eco-primary-rgb), 0.14)',
                  color: 'var(--eco-primary)',
                  marginBottom: '1rem',
                }}
              >
                <Icon size={22} />
              </div>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>{item.title}</h3>
              <p className="eco-text-muted" style={{ fontSize: '0.9rem', lineHeight: 1.65, margin: 0 }}>
                {item.body}
              </p>
            </motion.div>
          );
        })}
      </div>

      {/* ---------- tech stack ---------- */}
      <div className="eco-card" style={{ marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <Cpu size={18} style={{ color: 'var(--eco-purple)' }} />
          <h2 style={{ fontSize: '1.2rem', margin: 0 }}>How it is built</h2>
        </div>
        <p className="eco-text-muted" style={{ fontSize: '0.9rem', lineHeight: 1.65, marginBottom: '1.1rem' }}>
          A React front end talks to a Python Flask API, which is the only thing
          that touches the database. Emission factors live in Firestore rather
          than in the code, so they can be updated without a redeploy.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {STACK.map((tech) => (
            <span key={tech} className="eco-badge">
              {tech}
            </span>
          ))}
        </div>
      </div>

      {/* ---------- FAQ ---------- */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '1.3rem' }}>
        <HelpCircle size={20} style={{ color: 'var(--eco-primary)' }} />
        <h2 style={{ fontSize: '1.4rem', margin: 0 }}>Common questions</h2>
      </div>
      <div style={{ display: 'grid', gap: '0.8rem', marginBottom: '3rem' }}>
        {FAQS.map((item, index) => {
          const isOpen = openFaq === index;
          return (
            <motion.div
              key={item.q}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: false, amount: 0.4 }}
              transition={{ duration: 0.4, delay: index * 0.05 }}
              className="eco-card"
              style={{ padding: 0, overflow: 'hidden' }}
            >
              <button
                type="button"
                onClick={() => setOpenFaq(isOpen ? -1 : index)}
                aria-expanded={isOpen}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  padding: '1.1rem 1.3rem',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--eco-text)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  font: 'inherit',
                }}
              >
                <span style={{ fontSize: '1rem', fontWeight: 600 }}>{item.q}</span>
                <ChevronDown
                  size={18}
                  style={{
                    flexShrink: 0,
                    color: 'var(--eco-primary)',
                    transform: isOpen ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.25s ease',
                  }}
                />
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    style={{ overflow: 'hidden' }}
                  >
                    <p
                      className="eco-text-muted"
                      style={{ fontSize: '0.9rem', lineHeight: 1.7, margin: 0, padding: '0 1.3rem 1.2rem' }}
                    >
                      {item.a}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* ---------- CTA ---------- */}
      <div style={{ textAlign: 'center' }}>
        <Leaf size={34} style={{ color: 'var(--eco-primary)', marginBottom: '1rem' }} />
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.8rem' }}>
          Ready to see <span className="eco-gradient-text">your number</span>?
        </h2>
        <Link to="/register" className="eco-btn eco-btn-primary eco-btn-pulse" style={{ padding: '0.9rem 2rem' }}>
          Start tracking free
          <ArrowRight size={18} />
        </Link>
      </div>
    </div>
  );
}
