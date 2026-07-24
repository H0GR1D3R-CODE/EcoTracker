// EcoTrack/frontend/src/pages/Home.jsx
// The public landing page - the first thing anyone sees.
//
// What is happening on this page:
//   * tsparticles draws floating particles behind the hero
//   * useParallax drifts the hero content slower than the page scrolls
//   * useCounter counts the statistics up from zero when they scroll into view
//   * useStaggerReveal fades the feature cards in one after another
//   * the feature cards tilt in 3D towards the mouse pointer
//   * the testimonial carousel advances itself every few seconds
//
// Every one of those effects checks prefersReducedMotion first, because
// animation that cannot be switched off is an accessibility failure.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Particles, { initParticlesEngine } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import {
  ArrowRight,
  BarChart3,
  Car,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Droplets,
  Flame,
  Globe2,
  Leaf,
  LineChart,
  Quote,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Target,
  Trash2,
  UtensilsCrossed,
  Zap,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useCounter } from '../hooks/useCounter';
import { useScrollReveal, useStaggerReveal, useParallax } from '../hooks/useScrollReveal';

// ---------------------------------------------------------------------------
// PAGE DATA
// The statistics are placeholder figures for the landing page only. Every
// number a signed-in user sees is calculated from their own real records.
// ---------------------------------------------------------------------------

const HERO_STATS = [
  { value: 12480, suffix: ' kg', label: 'CO₂ tracked', decimals: 0 },
  { value: 340, suffix: '+', label: 'Active trackers', decimals: 0 },
  { value: 1250, suffix: '', label: 'Goals achieved', decimals: 0 },
  { value: 7, suffix: '', label: 'Emission categories', decimals: 0 },
];

const CATEGORIES = [
  { icon: Car, name: 'Transport', detail: 'Cars, buses, trains and flights', color: '#00ff87' },
  { icon: Zap, name: 'Electricity', detail: 'Grid power and rooftop solar', color: '#f59e0b' },
  { icon: Flame, name: 'Fuel', detail: 'LPG cylinders and generators', color: '#ef4444' },
  { icon: UtensilsCrossed, name: 'Diet', detail: 'Meals by dietary choice', color: '#7c3aed' },
  { icon: Trash2, name: 'Waste', detail: 'Landfill against recycling', color: '#8888aa' },
  { icon: Droplets, name: 'Water', detail: 'The energy behind your tap', color: '#0ea5e9' },
  { icon: ShoppingBag, name: 'Consumption', detail: 'Clothing and electronics', color: '#ec4899' },
];

const FEATURES = [
  {
    icon: BarChart3,
    title: 'Seven categories, one number',
    body: 'Transport, electricity, fuel, diet, waste, water and consumption all roll up into a single monthly footprint you can actually act on.',
  },
  {
    icon: Target,
    title: 'Goals per category',
    body: 'A goal like "cut transport 25% by December" tells you what to change. "Reduce emissions" tells you nothing. So goals are set per category.',
  },
  {
    icon: LineChart,
    title: 'Trends that make sense',
    body: 'Six months of history, month-on-month comparison, and a breakdown showing exactly which habit is costing the most carbon.',
  },
  {
    icon: ShieldCheck,
    title: 'Scientific factors',
    body: 'Every calculation uses published emission factors from DEFRA, the IPCC and the Central Electricity Authority of India — never invented numbers.',
  },
];

const TESTIMONIALS = [
  {
    quote:
      'I genuinely had no idea my commute was three quarters of my footprint until I saw the breakdown. Switched to the bus twice a week and watched the line drop.',
    name: 'Priya R.',
    role: 'Postgraduate student',
  },
  {
    quote:
      'The per-category goals are the part that works. A single overall target felt hopeless. Cutting one category by 20% felt like something I could actually do.',
    name: 'Arjun M.',
    role: 'Software engineer',
  },
  {
    quote:
      'Being told 4 kg of CO₂ means nothing to me. Being told it is the same as driving 30 km — that I understand immediately.',
    name: 'Fatima S.',
    role: 'Environmental science researcher',
  },
];

// ---------------------------------------------------------------------------
// A statistic that counts up when it scrolls into view
// ---------------------------------------------------------------------------

function CountUpStat({ value, suffix, label, decimals }) {
  const [ref, formatted] = useCounter(value, { decimals, duration: 1800 });

  return (
    <div ref={ref} style={{ textAlign: 'center' }}>
      <div
        className="eco-gradient-text"
        style={{
          fontFamily: 'Space Grotesk, sans-serif',
          fontSize: 'clamp(1.7rem, 4vw, 2.5rem)',
          fontWeight: 700,
          lineHeight: 1.1,
        }}
      >
        {formatted}
        {suffix}
      </div>
      <div className="eco-text-muted" style={{ fontSize: '0.84rem', marginTop: '0.25rem' }}>
        {label}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A feature card that tilts in 3D towards the mouse
//
// The maths: work out where the pointer is inside the card as a fraction from
// -0.5 to +0.5 on each axis, then rotate by that fraction times a maximum angle.
// ---------------------------------------------------------------------------

function TiltCard({ children, disabled = false }) {
  const cardRef = useRef(null);

  const handleMouseMove = (event) => {
    if (disabled || !cardRef.current) return;

    const bounds = cardRef.current.getBoundingClientRect();
    const xFraction = (event.clientX - bounds.left) / bounds.width - 0.5;
    const yFraction = (event.clientY - bounds.top) / bounds.height - 0.5;

    const MAX_TILT = 9; // degrees
    // Y movement tilts around the X axis, hence the swap - and it is negated
    // so the card leans towards the pointer rather than away from it
    cardRef.current.style.transform =
      `perspective(900px) rotateX(${-yFraction * MAX_TILT}deg) ` +
      `rotateY(${xFraction * MAX_TILT}deg) translateY(-4px)`;
  };

  const handleMouseLeave = () => {
    if (!cardRef.current) return;
    cardRef.current.style.transform = '';
  };

  return (
    <div
      ref={cardRef}
      className="eco-card"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        height: '100%',
        transition: 'transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease',
        // transform-style keeps child elements in the same 3D space as the card
        transformStyle: 'preserve-3d',
        willChange: 'transform',
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// THE PAGE
// ---------------------------------------------------------------------------

export default function Home() {
  const { user } = useAuth();
  const { prefersReducedMotion } = useTheme();

  // --- tsparticles has to load its engine once before it can render ---
  const [particlesReady, setParticlesReady] = useState(false);

  useEffect(() => {
    // loadSlim is the cut-down bundle - the full one is far larger than this
    // page needs, and page weight matters on a phone
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => setParticlesReady(true));
  }, []);

  // useMemo stops the options object being rebuilt on every render, which
  // would make tsparticles tear down and restart the whole animation
  const particleOptions = useMemo(
    () => ({
      fullScreen: { enable: false }, // stay inside the hero, not over the whole page
      background: { color: { value: 'transparent' } },
      fpsLimit: 60,
      detectRetina: true,
      particles: {
        number: { value: 42, density: { enable: true, width: 1400, height: 900 } },
        color: { value: ['#00ff87', '#7c3aed', '#00c96b'] },
        shape: { type: 'circle' },
        opacity: { value: { min: 0.15, max: 0.5 } },
        size: { value: { min: 1, max: 3.5 } },
        move: {
          enable: true,
          speed: 0.7,          // slow drift, like dust in sunlight
          direction: 'top',    // particles rise, which reads as "clean air"
          random: true,
          straight: false,
          outModes: { default: 'out' },
        },
        links: {
          enable: true,
          distance: 145,
          color: '#00ff87',
          opacity: 0.12,
          width: 1,
        },
      },
      interactivity: {
        events: { onHover: { enable: true, mode: 'grab' } },
        modes: { grab: { distance: 150, links: { opacity: 0.28 } } },
      },
    }),
    []
  );

  // --- scroll animations ---
  const heroContentRef = useParallax(0.12);
  const statsRef = useScrollReveal({ y: 30 });
  const categoriesRef = useStaggerReveal('.category-chip', { stagger: 0.06, y: 24 });
  const featuresRef = useStaggerReveal('.feature-card', { stagger: 0.12 });
  const sdgRef = useScrollReveal({ y: 36 });
  const testimonialRef = useScrollReveal({ y: 30 });
  const ctaRef = useScrollReveal({ y: 30 });

  // --- testimonial carousel ---
  const [activeTestimonial, setActiveTestimonial] = useState(0);

  const nextTestimonial = useCallback(() => {
    // The modulo wraps back to 0 after the last one
    setActiveTestimonial((current) => (current + 1) % TESTIMONIALS.length);
  }, []);

  const previousTestimonial = () => {
    // Adding length before the modulo keeps the result positive going backwards
    setActiveTestimonial(
      (current) => (current - 1 + TESTIMONIALS.length) % TESTIMONIALS.length
    );
  };

  useEffect(() => {
    // Auto-advancing is motion the user did not ask for, so it is switched off
    // entirely when reduced motion is requested
    if (prefersReducedMotion) return undefined;

    const timer = setInterval(nextTestimonial, 6000);
    return () => clearInterval(timer);
  }, [nextTestimonial, prefersReducedMotion]);

  // Signed-in visitors get "Go to dashboard" instead of "Get started free"
  const primaryCta = user
    ? { to: '/dashboard', label: 'Go to your dashboard' }
    : { to: '/register', label: 'Start tracking free' };

  return (
    <div>
      {/* ================= HERO ================= */}
      <section className="eco-hero eco-dot-grid">
        {/* Particle canvas, pinned behind everything else in the hero */}
        {particlesReady && !prefersReducedMotion && (
          <Particles
            id="eco-hero-particles"
            options={particleOptions}
            style={{ position: 'absolute', inset: 0, zIndex: 0 }}
          />
        )}

        {/* Coloured glows */}
        <div
          className="eco-glow-orb"
          style={{ width: 520, height: 520, background: 'var(--eco-primary)', top: '-12%', left: '-8%' }}
        />
        <div
          className="eco-glow-orb"
          style={{ width: 440, height: 440, background: 'var(--eco-purple)', bottom: '-14%', right: '-6%' }}
        />

        <div className="container" style={{ position: 'relative', zIndex: 2 }}>
          <div ref={heroContentRef} style={{ maxWidth: 860, margin: '0 auto', textAlign: 'center' }}>
            {/* SDG 13 badge with an animated gradient border */}
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              style={{ display: 'inline-block', marginBottom: '1.6rem', position: 'relative' }}
            >
              <div
                className="eco-badge"
                style={{
                  position: 'relative',
                  zIndex: 1,
                  background: 'var(--eco-bg)',
                  padding: '0.45rem 1rem',
                }}
              >
                <Globe2 size={15} style={{ color: 'var(--eco-primary)' }} />
                <span style={{ fontWeight: 600 }}>UN SDG 13 · Climate Action</span>
              </div>

              {/* The animated border sits behind the badge and is 2px larger */}
              {!prefersReducedMotion && (
                <div
                  style={{
                    position: 'absolute',
                    inset: -2,
                    borderRadius: 999,
                    background:
                      'linear-gradient(135deg, #00ff87, #7c3aed, #00ff87)',
                    backgroundSize: '300% 300%',
                    animation: 'eco-gradient-shift 4s ease infinite',
                    zIndex: 0,
                  }}
                />
              )}
            </motion.div>

            <motion.h1
              initial={prefersReducedMotion ? false : { opacity: 0, y: 26 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.08 }}
              style={{
                // clamp() picks a size between the two limits based on screen
                // width, so one line handles phones through to desktops
                fontSize: 'clamp(2.3rem, 6.5vw, 4.2rem)',
                lineHeight: 1.06,
                marginBottom: '1.2rem',
              }}
            >
              Know your carbon.
              <br />
              <span className="eco-gradient-text">Then change it.</span>
            </motion.h1>

            <motion.p
              initial={prefersReducedMotion ? false : { opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.16 }}
              className="eco-text-muted"
              style={{
                fontSize: 'clamp(1rem, 2.2vw, 1.18rem)',
                maxWidth: 620,
                margin: '0 auto 2.2rem',
              }}
            >
              EcoTrack turns everyday choices — your commute, your meals, your
              electricity bill — into a number you can see, compare and bring down.
              Seven categories. Published science. No guesswork.
            </motion.p>

            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.24 }}
              style={{
                display: 'flex',
                gap: '0.85rem',
                justifyContent: 'center',
                flexWrap: 'wrap',
              }}
            >
              <Link
                to={primaryCta.to}
                className="eco-btn eco-btn-primary eco-btn-pulse"
                style={{ padding: '0.95rem 2rem', fontSize: '1rem' }}
              >
                {primaryCta.label}
                <ArrowRight size={18} />
              </Link>

              <a href="#how-it-works" className="eco-btn eco-btn-outline" style={{ padding: '0.95rem 1.8rem' }}>
                See how it works
              </a>
            </motion.div>

            {/* Hero statistics - these count up on scroll */}
            <div
              ref={statsRef}
              className="eco-reveal"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '1.4rem',
                marginTop: '4rem',
                paddingTop: '2.2rem',
                borderTop: '1px solid var(--eco-border)',
              }}
            >
              {HERO_STATS.map((stat) => (
                <CountUpStat key={stat.label} {...stat} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ================= CATEGORIES ================= */}
      <section className="eco-section" id="how-it-works">
        <div className="container">
          <div style={{ textAlign: 'center', maxWidth: 660, margin: '0 auto 3rem' }}>
            <div className="eco-badge" style={{ marginBottom: '1rem' }}>
              <Sparkles size={14} style={{ color: 'var(--eco-primary)' }} />
              Seven categories
            </div>
            <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', marginBottom: '0.9rem' }}>
              Everything that makes up <span className="eco-gradient-text">your footprint</span>
            </h2>
            <p className="eco-text-muted" style={{ margin: 0 }}>
              Log an activity in any category and EcoTrack converts it to kilograms
              of CO₂ using the published factor for that activity.
            </p>
          </div>

          <div
            ref={categoriesRef}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1rem',
            }}
          >
            {CATEGORIES.map((category) => {
              const Icon = category.icon;
              return (
                <div
                  key={category.name}
                  className="eco-card eco-card-hover category-chip eco-reveal"
                  style={{ display: 'flex', alignItems: 'flex-start', gap: '0.9rem' }}
                >
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 12,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      // The 1A on the end of the hex is roughly 10% opacity
                      background: `${category.color}1A`,
                      color: category.color,
                    }}
                  >
                    <Icon size={21} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontFamily: 'Space Grotesk, sans-serif' }}>
                      {category.name}
                    </div>
                    <div className="eco-text-muted" style={{ fontSize: '0.85rem' }}>
                      {category.detail}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================= FEATURES ================= */}
      <section className="eco-section" style={{ background: 'var(--eco-bg-alt)' }}>
        <div className="container">
          <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 3rem' }}>
            <h2 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', marginBottom: '0.9rem' }}>
              Built to <span className="eco-gradient-text">change behaviour</span>
            </h2>
            <p className="eco-text-muted" style={{ margin: 0 }}>
              Measuring is easy. Measuring in a way that actually makes someone
              act is the hard part — and that is what shaped every screen here.
            </p>
          </div>

          <div
            ref={featuresRef}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '1.3rem',
            }}
          >
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                // The GSAP selector and the .eco-reveal starting state must sit
                // on the SAME element, or the wrapper stays at opacity 0 forever
                <div key={feature.title} className="feature-card eco-reveal">
                  <TiltCard disabled={prefersReducedMotion}>
                    <div
                      style={{
                        width: 46,
                        height: 46,
                        borderRadius: 13,
                        background: 'linear-gradient(135deg, rgba(0,255,135,0.16), rgba(124,58,237,0.16))',
                        color: 'var(--eco-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '1.1rem',
                      }}
                    >
                      <Icon size={23} />
                    </div>
                    <h3 style={{ fontSize: '1.12rem', marginBottom: '0.55rem' }}>{feature.title}</h3>
                    <p className="eco-text-muted" style={{ fontSize: '0.92rem', margin: 0 }}>
                      {feature.body}
                    </p>
                  </TiltCard>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================= SDG 13 BANNER ================= */}
      <section className="eco-section">
        <div className="container">
          <div ref={sdgRef} className="eco-reveal">
            <div
              className="eco-card"
              style={{
                position: 'relative',
                overflow: 'hidden',
                padding: 'clamp(2rem, 5vw, 3.4rem)',
                textAlign: 'center',
              }}
            >
              <div
                className="eco-glow-orb"
                style={{
                  width: 300,
                  height: 300,
                  background: 'var(--eco-primary)',
                  top: '-40%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                }}
              />

              <div style={{ position: 'relative', zIndex: 1 }}>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--eco-primary), var(--eco-purple))',
                    color: '#04140c',
                    marginBottom: '1.3rem',
                  }}
                  className={prefersReducedMotion ? '' : 'eco-pulse'}
                >
                  <Cloud size={30} />
                </div>

                <h2 style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.3rem)', marginBottom: '1rem' }}>
                  Aligned with <span className="eco-gradient-text">SDG 13: Climate Action</span>
                </h2>

                <p
                  className="eco-text-muted"
                  style={{ maxWidth: 620, margin: '0 auto', fontSize: '1rem' }}
                >
                  Goal 13 of the United Nations Sustainable Development Goals calls for
                  urgent action to combat climate change. Individual awareness is where
                  that action starts — you cannot reduce what you have never measured.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= TESTIMONIALS ================= */}
      <section className="eco-section" style={{ background: 'var(--eco-bg-alt)' }}>
        <div className="container">
          <div ref={testimonialRef} className="eco-reveal" style={{ maxWidth: 780, margin: '0 auto' }}>
            <h2
              style={{
                textAlign: 'center',
                fontSize: 'clamp(1.7rem, 4vw, 2.4rem)',
                marginBottom: '2.5rem',
              }}
            >
              What trackers <span className="eco-gradient-text">notice first</span>
            </h2>

            <div className="eco-card" style={{ padding: 'clamp(1.6rem, 4vw, 2.6rem)', minHeight: 250 }}>
              <Quote size={32} style={{ color: 'var(--eco-primary)', opacity: 0.5 }} />

              {/* key={activeTestimonial} makes React treat each quote as a new
                  element, which is what re-triggers the fade animation */}
              <motion.div
                key={activeTestimonial}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.42 }}
              >
                <p
                  style={{
                    fontSize: 'clamp(1rem, 2.2vw, 1.18rem)',
                    lineHeight: 1.65,
                    margin: '1.1rem 0 1.6rem',
                  }}
                >
                  {TESTIMONIALS[activeTestimonial].quote}
                </p>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, var(--eco-primary), var(--eco-purple))',
                      color: '#04140c',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontFamily: 'Space Grotesk, sans-serif',
                    }}
                  >
                    {TESTIMONIALS[activeTestimonial].name.charAt(0)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{TESTIMONIALS[activeTestimonial].name}</div>
                    <div className="eco-text-muted" style={{ fontSize: '0.84rem' }}>
                      {TESTIMONIALS[activeTestimonial].role}
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Carousel controls */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: '1.8rem',
                  paddingTop: '1.2rem',
                  borderTop: '1px solid var(--eco-border)',
                }}
              >
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  {TESTIMONIALS.map((testimonial, index) => (
                    <button
                      key={testimonial.name}
                      type="button"
                      onClick={() => setActiveTestimonial(index)}
                      aria-label={`Show testimonial ${index + 1}`}
                      style={{
                        width: index === activeTestimonial ? 24 : 8,
                        height: 8,
                        borderRadius: 4,
                        border: 'none',
                        cursor: 'pointer',
                        background:
                          index === activeTestimonial ? 'var(--eco-primary)' : 'var(--eco-border)',
                        transition: 'width 0.3s ease, background-color 0.3s ease',
                        padding: 0,
                      }}
                    />
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={previousTestimonial}
                    aria-label="Previous testimonial"
                    className="eco-btn eco-btn-ghost"
                    style={{ padding: '0.4rem 0.6rem' }}
                  >
                    <ChevronLeft size={17} />
                  </button>
                  <button
                    type="button"
                    onClick={nextTestimonial}
                    aria-label="Next testimonial"
                    className="eco-btn eco-btn-ghost"
                    style={{ padding: '0.4rem 0.6rem' }}
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= FINAL CALL TO ACTION ================= */}
      <section className="eco-section eco-line-grid">
        <div className="container">
          <div
            ref={ctaRef}
            className="eco-reveal"
            style={{ textAlign: 'center', maxWidth: 620, margin: '0 auto' }}
          >
            <Leaf size={40} style={{ color: 'var(--eco-primary)', marginBottom: '1.2rem' }} />

            <h2 style={{ fontSize: 'clamp(1.9rem, 4.5vw, 2.9rem)', marginBottom: '1rem' }}>
              Your first entry takes <span className="eco-gradient-text">thirty seconds</span>
            </h2>

            <p className="eco-text-muted" style={{ marginBottom: '2rem' }}>
              Log one car journey and you will already know more about your footprint
              than most people ever will.
            </p>

            <Link
              to={primaryCta.to}
              className="eco-btn eco-btn-primary eco-btn-pulse"
              style={{ padding: '1rem 2.4rem', fontSize: '1.05rem' }}
            >
              {primaryCta.label}
              <ArrowRight size={19} />
            </Link>
          </div>
        </div>
      </section>

      {/* ================= FOOTER ================= */}
      <footer
        style={{
          borderTop: '1px solid var(--eco-border)',
          padding: '2.5rem 0',
          background: 'var(--eco-bg-alt)',
        }}
      >
        <div
          className="container"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '1.2rem',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <Leaf size={22} style={{ color: 'var(--eco-primary)' }} />
            <span
              className="eco-gradient-text"
              style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '1.15rem' }}
            >
              EcoTrack
            </span>
          </div>

          <p className="eco-text-muted" style={{ margin: 0, fontSize: '0.85rem' }}>
            Emission factors: DEFRA 2023 · IPCC 2006 · CEA India 2023 · Our World in Data
          </p>

          <p className="eco-text-muted" style={{ margin: 0, fontSize: '0.85rem' }}>
            Built for SDG 13 · Climate Action
          </p>
        </div>
      </footer>
    </div>
  );
}
