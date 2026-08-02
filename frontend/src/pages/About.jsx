// EcoTrack/frontend/src/pages/About.jsx
// Public "about" page - the project's mission, kept visual and uncluttered:
// an animated hero, a few headline figures, the reason it exists beside a photo,
// and three principles as interactive cards. Static content, no login, no backend.

import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Cloud, Leaf, LineChart, ShieldCheck, Target } from 'lucide-react';

import Photo from '../components/Photo';
import AuroraBackground from '../components/AuroraBackground';
import { PHOTOS } from '../utils/photos';
import { useTheme } from '../context/ThemeContext';

const STATS = [
  { value: '7', label: 'emission categories tracked' },
  { value: '1.5°C', label: 'the warming limit we aim to stay under' },
  { value: '~2 t', label: 'a fair yearly footprint per person' },
  { value: '100%', label: 'figures traceable to a public source' },
];

const PRINCIPLES = [
  {
    icon: LineChart,
    title: 'Measure honestly',
    body: 'Every figure comes from a published emission factor — DEFRA, the IPCC, the CEA India, Our World in Data. Nothing invented; everything traceable.',
  },
  {
    icon: Target,
    title: 'Act specifically',
    body: 'One overall "reduce emissions" target tells you nothing. EcoTrack splits your footprint into categories so you always know what to actually change.',
  },
  {
    icon: ShieldCheck,
    title: 'Respect privacy',
    body: 'Your data is yours. Sign-in runs through Firebase Authentication, and the server verifies your identity before any data is ever read.',
  },
];

export default function About() {
  const { prefersReducedMotion } = useTheme();

  return (
    <div style={{ paddingBottom: '5rem' }}>
      {/* ---------- hero with animated aurora background ---------- */}
      <section style={{ position: 'relative', overflow: 'hidden', padding: 'clamp(3rem, 9vw, 6.5rem) 0 clamp(2.5rem, 6vw, 4rem)' }}>
        <AuroraBackground opacity={0.32} />
        <div className="container" style={{ position: 'relative', zIndex: 1 }}>
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            style={{ textAlign: 'center', maxWidth: 780, margin: '0 auto' }}
          >
            <span className="eco-badge" style={{ marginBottom: '1.5rem' }}>
              <Cloud size={14} style={{ color: 'var(--eco-primary)' }} />
              UN SDG 13 · Climate Action
            </span>
            <h1 style={{ fontSize: 'clamp(2.6rem, 8.5vw, 4.8rem)', lineHeight: 1.0, margin: '0 0 1.3rem' }}>
              About <span className="eco-gradient-text">EcoTrack</span>
            </h1>
            <p className="eco-text-muted" style={{ fontSize: 'clamp(1.05rem, 2.4vw, 1.3rem)', lineHeight: 1.6, margin: '0 auto', maxWidth: 640 }}>
              You cannot reduce what you never measure. EcoTrack turns the vague worry
              of a carbon footprint into a real number you can see — and bring down.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ---------- headline figures ---------- */}
      <div className="container" style={{ maxWidth: 960 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '1rem',
            textAlign: 'center',
            marginBottom: 'clamp(3rem, 8vw, 5rem)',
          }}
        >
          {STATS.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.45, delay: index * 0.08 }}
            >
              <div
                className="eco-gradient-text"
                style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 'clamp(2rem, 5vw, 2.8rem)', lineHeight: 1.05 }}
              >
                {stat.value}
              </div>
              <div className="eco-text-muted" style={{ fontSize: '0.82rem', marginTop: '0.4rem', lineHeight: 1.4 }}>
                {stat.label}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ---------- why it exists (editorial) ---------- */}
      <div className="container" style={{ maxWidth: 1000, marginBottom: 'clamp(3rem, 8vw, 5rem)' }}>
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 'clamp(1.5rem, 4vw, 3rem)',
            alignItems: 'center',
          }}
        >
          <div>
            <h2 style={{ fontSize: 'clamp(1.7rem, 4vw, 2.6rem)', lineHeight: 1.12, margin: '0 0 1.1rem' }}>
              Why it <span className="eco-gradient-text">exists</span>
            </h2>
            <p className="eco-text-muted" style={{ fontSize: '1.05rem', lineHeight: 1.8, margin: 0 }}>
              Climate change can feel too big for one person to affect. But the average
              footprint is the sum of ordinary decisions — how you travel, what you eat,
              the power you use. EcoTrack makes those choices visible, so small,
              deliberate changes add up to something real.
            </p>
          </div>
          <div
            className="eco-photo-zoom"
            style={{ borderRadius: 'var(--eco-radius)', overflow: 'hidden', minHeight: 'clamp(240px, 34vw, 340px)', boxShadow: 'var(--eco-shadow)' }}
          >
            <Photo
              id={PHOTOS.seedling}
              alt="Hands cupping a small green seedling growing from soil"
              width={720}
              className="eco-photo-cover"
              style={{ width: '100%', height: '100%', minHeight: 'clamp(240px, 34vw, 340px)', display: 'block' }}
            />
          </div>
        </motion.div>
      </div>

      {/* ---------- principles (interactive cards) ---------- */}
      <div className="container" style={{ maxWidth: 1000, marginBottom: 'clamp(3rem, 8vw, 5rem)' }}>
        <h2 style={{ fontSize: 'clamp(1.6rem, 3.6vw, 2.3rem)', marginBottom: '2rem', textAlign: 'center' }}>
          What EcoTrack <span className="eco-gradient-text">stands for</span>
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '1.3rem',
          }}
        >
          {PRINCIPLES.map((item, index) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.title}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                whileHover={prefersReducedMotion ? {} : { y: -6 }}
                className="eco-card eco-card-hover"
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 13,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(135deg, rgba(8,168,105,0.18), rgba(14,121,207,0.18))',
                    color: 'var(--eco-primary)',
                    marginBottom: '1.1rem',
                  }}
                >
                  <Icon size={23} />
                </div>
                <h3 style={{ fontSize: '1.15rem', marginBottom: '0.6rem' }}>{item.title}</h3>
                <p className="eco-text-muted" style={{ fontSize: '0.92rem', lineHeight: 1.65, margin: 0 }}>
                  {item.body}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* ---------- CTA ---------- */}
      <div className="container" style={{ textAlign: 'center' }}>
        <Leaf size={36} style={{ color: 'var(--eco-primary)', marginBottom: '1.1rem' }} />
        <h2 style={{ fontSize: 'clamp(1.7rem, 4vw, 2.6rem)', marginBottom: '1.1rem' }}>
          Ready to see <span className="eco-gradient-text">your number?</span>
        </h2>
        <Link to="/register" className="eco-btn eco-btn-primary eco-btn-pulse" style={{ padding: '0.9rem 2.1rem' }}>
          Start tracking free
          <ArrowRight size={18} />
        </Link>
      </div>
    </div>
  );
}
