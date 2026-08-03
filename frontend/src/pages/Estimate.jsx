// EcoTrack/frontend/src/pages/Estimate.jsx
// A quick, no-login footprint estimator for visitors. Four lifestyle questions,
// a live-updating monthly estimate, a comparison to the climate-safe budget, and
// a call to sign up and track it precisely.
//
// HONEST ABOUT WHAT IT IS: a rough estimate from typical figures, built on the
// same published emission factors the real Calculator uses. It is deliberately
// simple - a conversation starter, not the precise per-activity logging you get
// once you sign in.

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Car, Check, Gauge, Leaf, ShoppingBag, Sparkles, UtensilsCrossed, Zap } from 'lucide-react';

import AuroraBackground from '../components/AuroraBackground';
import Photo from '../components/Photo';
import { PHOTOS } from '../utils/photos';
import { useTheme } from '../context/ThemeContext';

// A real photo for each question's category header.
const QUESTION_PHOTOS = {
  transport: 'nightTraffic',
  diet: 'freshVeg',
  home: 'bulb',
  shopping: 'shopping',
};

// A climate-safe personal footprint is ~2 tonnes/year ≈ 167 kg/month.
const MONTHLY_BUDGET = 167;

// Each option carries a rough monthly kg CO₂, derived from the published factors
// (DEFRA, CEA India, Our World in Data) applied to a typical month.
const QUESTIONS = [
  {
    key: 'transport',
    label: 'How do you usually get around?',
    icon: Car,
    color: '#4fbe80',
    options: [
      { id: 'car', label: 'Mostly by car', kg: 105 },
      { id: 'mix', label: 'Car + public transport', kg: 75 },
      { id: 'public', label: 'Mostly bus or train', kg: 35 },
      { id: 'active', label: 'Mostly walk or cycle', kg: 10 },
    ],
  },
  {
    key: 'diet',
    label: 'What does a typical day of food look like?',
    icon: UtensilsCrossed,
    color: '#a4739e',
    options: [
      { id: 'meat', label: 'Meat most meals', kg: 110 },
      { id: 'mixed', label: 'A mix of meat and veg', kg: 70 },
      { id: 'veg', label: 'Mostly vegetarian', kg: 50 },
      { id: 'vegan', label: 'Vegan', kg: 35 },
    ],
  },
  {
    key: 'home',
    label: 'How much electricity does your home use?',
    icon: Zap,
    color: '#e0a23f',
    options: [
      { id: 'high', label: 'A lot — AC, larger home', kg: 90 },
      { id: 'avg', label: 'About average', kg: 55 },
      { id: 'low', label: 'Little — I am careful', kg: 30 },
    ],
  },
  {
    key: 'shopping',
    label: 'How often do you buy new things?',
    icon: ShoppingBag,
    color: '#d9694e',
    options: [
      { id: 'often', label: 'Often — clothes, gadgets', kg: 60 },
      { id: 'sometimes', label: 'Now and then', kg: 35 },
      { id: 'rarely', label: 'Rarely, or buy used', kg: 15 },
    ],
  },
];

export default function Estimate() {
  const { prefersReducedMotion } = useTheme();
  const [answers, setAnswers] = useState({});

  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === QUESTIONS.length;

  // Running total + per-category breakdown of whatever has been answered.
  const { total, breakdown } = useMemo(() => {
    let sum = 0;
    const parts = [];
    QUESTIONS.forEach((q) => {
      const chosen = q.options.find((o) => o.id === answers[q.key]);
      if (chosen) {
        sum += chosen.kg;
        parts.push({ key: q.key, label: q.label, color: q.color, kg: chosen.kg });
      }
    });
    return { total: sum, breakdown: parts };
  }, [answers]);

  const budgetPct = Math.round((total / MONTHLY_BUDGET) * 100);
  const overBudget = total > MONTHLY_BUDGET;
  const maxPart = Math.max(...breakdown.map((p) => p.kg), 1);

  return (
    <div style={{ paddingBottom: '4rem' }}>
      {/* hero */}
      <section style={{ position: 'relative', overflow: 'hidden', padding: 'clamp(2.5rem, 7vw, 4.5rem) 0 clamp(1.5rem, 4vw, 2.5rem)' }}>
        <AuroraBackground opacity={0.3} />
        <div className="container" style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 720, margin: '0 auto' }}>
          <span className="eco-badge" style={{ marginBottom: '1.3rem' }}>
            <Gauge size={14} style={{ color: 'var(--eco-primary)' }} />
            30-second estimate · no sign-up
          </span>
          <h1 style={{ fontSize: 'clamp(2.4rem, 7vw, 4rem)', lineHeight: 1.03, margin: '0 0 1.1rem' }}>
            What&rsquo;s your <span className="eco-gradient-text">footprint?</span>
          </h1>
          <p className="eco-text-muted" style={{ fontSize: '1.1rem', lineHeight: 1.6, margin: '0 auto', maxWidth: 560 }}>
            Answer four quick questions and watch your rough monthly footprint appear.
            No account needed — just tap.
          </p>
        </div>
      </section>

      <div
        className="container"
        style={{
          maxWidth: 1040,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1.5rem',
          alignItems: 'start',
        }}
      >
        {/* ---------- questions ---------- */}
        <div style={{ display: 'grid', gap: '1.2rem' }}>
          {QUESTIONS.map((q, index) => {
            const Icon = q.icon;
            return (
              <motion.div
                key={q.key}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.45, delay: index * 0.05 }}
                className="eco-card eco-photo-zoom"
                style={{ padding: 0, overflow: 'hidden' }}
              >
                {/* photo header with the question over it */}
                <div style={{ position: 'relative', height: 104, overflow: 'hidden' }}>
                  <Photo
                    id={PHOTOS[QUESTION_PHOTOS[q.key]]}
                    alt={q.label}
                    width={820}
                    color={q.color}
                    className="eco-photo-cover"
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'linear-gradient(100deg, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.2) 100%)',
                    }}
                  />
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0 1.2rem' }}>
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 11,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: q.color,
                        color: '#04140c',
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={19} />
                    </div>
                    <h2 style={{ fontSize: '1.02rem', margin: 0, color: '#fff', lineHeight: 1.25 }}>{q.label}</h2>
                  </div>
                </div>

                <div style={{ padding: '1.1rem 1.2rem 1.3rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.6rem' }}>
                  {q.options.map((opt) => {
                    const active = answers[q.key] === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setAnswers((prev) => ({ ...prev, [q.key]: opt.id }))}
                        style={{
                          textAlign: 'left',
                          padding: '0.7rem 0.85rem',
                          borderRadius: 'var(--eco-radius-sm)',
                          cursor: 'pointer',
                          fontSize: '0.86rem',
                          fontWeight: active ? 600 : 500,
                          color: active ? '#fff' : 'var(--eco-text)',
                          border: active ? `1px solid ${q.color}` : '1px solid var(--eco-border)',
                          background: active ? q.color : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '0.4rem',
                          transition: 'all 0.18s ease',
                        }}
                      >
                        {opt.label}
                        {active && <Check size={15} style={{ flexShrink: 0 }} />}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* ---------- live result ---------- */}
        <div style={{ position: 'sticky', top: 90 }}>
          <div className="eco-card" style={{ textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
            <div
              className="eco-glow-orb eco-glow-orb-green"
              style={{ width: 240, height: 240, top: '-45%', left: '50%', transform: 'translateX(-50%)' }}
            />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <span className="eco-text-muted" style={{ fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
                Your estimate
              </span>

              <div style={{ margin: '0.7rem 0 0.2rem' }}>
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.div
                    key={total}
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={prefersReducedMotion ? {} : { opacity: 0, y: -12 }}
                    transition={{ duration: 0.3 }}
                    className="eco-gradient-text"
                    style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: 'clamp(2.6rem, 8vw, 3.6rem)', lineHeight: 1 }}
                  >
                    {total}
                  </motion.div>
                </AnimatePresence>
              </div>
              <div className="eco-text-muted" style={{ fontSize: '0.9rem', marginBottom: '1.2rem' }}>
                kg CO₂ / month {answeredCount < QUESTIONS.length && `(so far)`}
              </div>

              {/* budget bar */}
              {total > 0 && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', marginBottom: '0.4rem' }}>
                    <span className="eco-text-muted">vs a climate-safe footprint</span>
                    <span style={{ fontWeight: 700, color: overBudget ? 'var(--eco-orange)' : 'var(--eco-primary)' }}>
                      {budgetPct}%
                    </span>
                  </div>
                  <div style={{ height: 10, borderRadius: 999, background: 'var(--eco-border)', overflow: 'hidden', marginBottom: '0.5rem' }}>
                    <motion.div
                      animate={{ width: `${Math.min(budgetPct, 100)}%` }}
                      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                      style={{
                        height: '100%',
                        borderRadius: 999,
                        background: overBudget
                          ? 'linear-gradient(90deg, var(--eco-orange), var(--eco-danger))'
                          : 'linear-gradient(90deg, var(--eco-primary), var(--eco-purple))',
                      }}
                    />
                  </div>
                  <p className="eco-text-muted" style={{ fontSize: '0.78rem', margin: '0 0 1.2rem' }}>
                    The 1.5&nbsp;°C target is about {MONTHLY_BUDGET} kg a month per person.
                  </p>
                </>
              )}

              {/* breakdown */}
              {breakdown.length > 0 && (
                <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '1.3rem', textAlign: 'left' }}>
                  {breakdown.map((p) => (
                    <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--eco-border)', overflow: 'hidden' }}>
                        <motion.div
                          animate={{ width: `${(p.kg / maxPart) * 100}%` }}
                          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                          style={{ height: '100%', borderRadius: 999, background: p.color }}
                        />
                      </div>
                      <span className="eco-tabular" style={{ fontSize: '0.74rem', width: 46, textAlign: 'right', color: 'var(--eco-text-muted)' }}>
                        {p.kg} kg
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* prompt / CTA */}
              {allAnswered ? (
                <motion.div
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                >
                  <p style={{ fontSize: '0.9rem', lineHeight: 1.6, margin: '0 0 1rem' }}>
                    {overBudget
                      ? 'Above the line — but this is just an estimate. Track it precisely and watch it drop.'
                      : 'Nicely done. Track it precisely to keep it there and go further.'}
                  </p>
                  <Link to="/register" className="eco-btn eco-btn-primary eco-btn-pulse" style={{ width: '100%' }}>
                    Track it for real — free
                    <ArrowRight size={17} />
                  </Link>
                </motion.div>
              ) : (
                <p className="eco-text-muted" style={{ fontSize: '0.86rem', margin: 0, display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Sparkles size={14} style={{ color: 'var(--eco-primary)' }} />
                  Answer all four to see the full picture
                </p>
              )}
            </div>
          </div>

          <p
            className="eco-text-muted"
            style={{ fontSize: '0.72rem', textAlign: 'center', marginTop: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
          >
            <Leaf size={12} />
            A rough estimate from typical figures — your real footprint depends on the details.
          </p>
        </div>
      </div>
    </div>
  );
}
