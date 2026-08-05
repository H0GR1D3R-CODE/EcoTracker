// EcoTrack/frontend/src/pages/Estimate.jsx
// A quick, no-login footprint estimator for visitors. Four lifestyle questions,
// a live-updating monthly estimate, a comparison to the climate-safe budget, and
// a call to sign up and track it precisely.
//
// EVERY NUMBER ON THIS PAGE IS DERIVED, NOT TYPED
// Each option below states an assumption ("about 25 km a day by petrol car") and
// multiplies it by the SAME published factor the Calculator uses, mirrored from
// backend/seed_factors.py into FACTORS. Nothing is a hand-written guess.
//
// That matters because the two used to disagree badly. The old page hard-coded
// 35 kg/month for a vegan diet; the Calculator, at 1.1 kg per vegan meal and
// three meals a day, gives 99 kg for the same month. A visitor who estimated
// here and then tracked for real would have seen the app contradict itself.
//
// It is still an estimate: it asks four questions and covers four of the seven
// categories the Calculator tracks (no fuel, waste or water), so a real logged
// month is usually HIGHER, not lower. The page says so rather than flattering.

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Car,
  Check,
  Gauge,
  Info,
  Leaf,
  ShoppingBag,
  Sparkles,
  UtensilsCrossed,
  Zap,
} from 'lucide-react';

import AuroraBackground from '../components/AuroraBackground';
import Photo from '../components/Photo';
import { PHOTOS } from '../utils/photos';
import { useTheme } from '../context/ThemeContext';
import { useCounter } from '../hooks/useCounter';

// A real photo for each question's category header.
const QUESTION_PHOTOS = {
  transport: 'nightTraffic',
  diet: 'freshVeg',
  home: 'bulb',
  shopping: 'shopping',
};

// A climate-safe personal footprint is ~2 tonnes/year ≈ 167 kg/month.
const MONTHLY_BUDGET = 167;

// ---------------------------------------------------------------------------
// THE PUBLISHED FACTORS
// Mirrored exactly from backend/seed_factors.py. If a factor changes there, it
// changes here - that is the whole point of listing them rather than baking the
// arithmetic into a number nobody can check.
// ---------------------------------------------------------------------------
const FACTORS = {
  petrolCar: 0.141, // kg CO₂ per km      · DEFRA 2023
  bus: 0.082, // kg CO₂ per km            · DEFRA 2023
  train: 0.041, // kg CO₂ per km          · DEFRA 2023
  gridIndia: 0.71, // kg CO₂ per kWh      · CEA India 2023
  mealNonVeg: 3.3, // kg CO₂ per meal     · Our World in Data
  mealVeg: 1.7, // kg CO₂ per meal        · Our World in Data
  mealVegan: 1.1, // kg CO₂ per meal      · Our World in Data
  clothing: 8.0, // kg CO₂ per item       · fast-fashion lifecycle average
  electronics: 85.0, // kg CO₂ per item   · small-electronics lifecycle average
};

const DAYS = 30; // a typical month
const MEALS = DAYS * 3; // three meals a day

/** Round to whole kg - false precision would only imply accuracy we lack. */
const kg = (value) => Math.round(value);

const QUESTIONS = [
  {
    key: 'transport',
    label: 'How do you usually get around?',
    icon: Car,
    color: '#4fbe80',
    options: [
      {
        id: 'car',
        label: 'Mostly by car',
        detail: '≈ 25 km a day by petrol car',
        kg: kg(25 * DAYS * FACTORS.petrolCar),
      },
      {
        id: 'mix',
        label: 'Car + public transport',
        detail: '≈ 12 km car + 13 km bus a day',
        kg: kg(12 * DAYS * FACTORS.petrolCar + 13 * DAYS * FACTORS.bus),
      },
      {
        id: 'public',
        label: 'Mostly bus or train',
        detail: '≈ 25 km a day, split bus and train',
        kg: kg(12.5 * DAYS * FACTORS.bus + 12.5 * DAYS * FACTORS.train),
      },
      {
        id: 'active',
        label: 'Mostly walk or cycle',
        detail: '≈ 3 km a day by bus, the rest on foot',
        kg: kg(3 * DAYS * FACTORS.bus),
      },
    ],
  },
  {
    key: 'diet',
    label: 'What does a typical day of food look like?',
    icon: UtensilsCrossed,
    color: '#a4739e',
    options: [
      {
        id: 'meat',
        label: 'Meat most meals',
        detail: '≈ 2 of 3 meals with meat',
        kg: kg(60 * FACTORS.mealNonVeg + 30 * FACTORS.mealVeg),
      },
      {
        id: 'mixed',
        label: 'A mix of meat and veg',
        detail: '≈ 1 of 3 meals with meat',
        kg: kg(30 * FACTORS.mealNonVeg + 60 * FACTORS.mealVeg),
      },
      {
        id: 'veg',
        label: 'Mostly vegetarian',
        detail: `all ${MEALS} meals vegetarian`,
        kg: kg(MEALS * FACTORS.mealVeg),
      },
      {
        id: 'vegan',
        label: 'Vegan',
        detail: `all ${MEALS} meals plant-based`,
        kg: kg(MEALS * FACTORS.mealVegan),
      },
    ],
  },
  {
    key: 'home',
    label: 'How much electricity does your home use?',
    icon: Zap,
    color: '#e0a23f',
    options: [
      {
        id: 'high',
        label: 'A lot — AC, larger home',
        detail: '≈ 150 kWh a month, your share',
        kg: kg(150 * FACTORS.gridIndia),
      },
      {
        id: 'avg',
        label: 'About average',
        detail: '≈ 80 kWh a month, your share',
        kg: kg(80 * FACTORS.gridIndia),
      },
      {
        id: 'low',
        label: 'Little — I am careful',
        detail: '≈ 40 kWh a month, your share',
        kg: kg(40 * FACTORS.gridIndia),
      },
    ],
  },
  {
    key: 'shopping',
    label: 'How often do you buy new things?',
    icon: ShoppingBag,
    color: '#d9694e',
    options: [
      {
        id: 'often',
        label: 'Often — clothes, gadgets',
        detail: '≈ 3 garments a month, a gadget every 4',
        kg: kg(3 * FACTORS.clothing + FACTORS.electronics / 4),
      },
      {
        id: 'sometimes',
        label: 'Now and then',
        detail: '≈ 1 garment a month, a gadget a year',
        kg: kg(FACTORS.clothing + FACTORS.electronics / 12),
      },
      {
        id: 'rarely',
        label: 'Rarely, or buy used',
        detail: '≈ 1 garment every 3 months',
        kg: kg(FACTORS.clothing / 3 + FACTORS.electronics / 36),
      },
    ],
  },
];

export default function Estimate() {
  const { prefersReducedMotion } = useTheme();
  const [answers, setAnswers] = useState({});

  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === QUESTIONS.length;
  const progressPct = (answeredCount / QUESTIONS.length) * 100;

  // Running total + per-category breakdown of whatever has been answered.
  const { total, breakdown } = useMemo(() => {
    let sum = 0;
    const parts = [];
    QUESTIONS.forEach((question) => {
      const chosen = question.options.find((option) => option.id === answers[question.key]);
      if (chosen) {
        sum += chosen.kg;
        parts.push({
          key: question.key,
          label: question.label,
          color: question.color,
          kg: chosen.kg,
          detail: chosen.detail,
          choice: chosen.label,
        });
      }
    });
    return { total: sum, breakdown: parts };
  }, [answers]);

  // The headline figure rolls to its new value on every answer rather than
  // snapping, which makes the effect of each choice visible.
  const [totalRef, totalShown] = useCounter(total, {
    decimals: 0,
    startOnView: false,
    duration: 700,
  });

  const budgetPct = Math.round((total / MONTHLY_BUDGET) * 100);
  const overBudget = total > MONTHLY_BUDGET;
  const maxPart = Math.max(...breakdown.map((part) => part.kg), 1);

  return (
    <div style={{ paddingBottom: '4rem' }}>
      {/* hero */}
      <section
        style={{
          position: 'relative',
          overflow: 'hidden',
          padding: 'clamp(2.5rem, 7vw, 4.5rem) 0 clamp(1.5rem, 4vw, 2.5rem)',
        }}
      >
        <AuroraBackground opacity={0.3} />
        <div
          className="container"
          style={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 720, margin: '0 auto' }}
        >
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

          {/* progress, so the four questions feel finite */}
          <div style={{ maxWidth: 320, margin: '1.8rem auto 0' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.74rem',
                marginBottom: '0.4rem',
              }}
              className="eco-text-muted"
            >
              <span>{answeredCount} of {QUESTIONS.length} answered</span>
              <span>{Math.round(progressPct)}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: 'var(--eco-border)', overflow: 'hidden' }}>
              <motion.div
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  height: '100%',
                  borderRadius: 999,
                  background: 'linear-gradient(90deg, var(--eco-primary), var(--eco-purple))',
                }}
              />
            </div>
          </div>
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
          {QUESTIONS.map((question, index) => {
            const Icon = question.icon;
            const answered = Boolean(answers[question.key]);
            return (
              <motion.div
                key={question.key}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.45, delay: index * 0.05 }}
                className="eco-card eco-photo-zoom"
                style={{
                  padding: 0,
                  overflow: 'hidden',
                  // answering a card marks it, so progress is visible in place
                  borderColor: answered ? `color-mix(in srgb, ${question.color} 40%, transparent)` : undefined,
                  transition: 'border-color 0.3s ease',
                }}
              >
                {/* photo header with the question over it */}
                <div style={{ position: 'relative', height: 104, overflow: 'hidden' }}>
                  <Photo
                    id={PHOTOS[QUESTION_PHOTOS[question.key]]}
                    alt={question.label}
                    width={820}
                    color={question.color}
                    className="eco-photo-cover"
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background:
                        'linear-gradient(100deg, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.2) 100%)',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.7rem',
                      padding: '0 1.2rem',
                    }}
                  >
                    <motion.div
                      animate={
                        prefersReducedMotion || !answered ? {} : { scale: [1, 1.15, 1] }
                      }
                      transition={{ duration: 0.35 }}
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 11,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: question.color,
                        color: '#04140c',
                        flexShrink: 0,
                      }}
                    >
                      {answered ? <Check size={19} /> : <Icon size={19} />}
                    </motion.div>
                    <h2 style={{ fontSize: '1.02rem', margin: 0, color: '#fff', lineHeight: 1.25 }}>
                      {question.label}
                    </h2>
                  </div>
                </div>

                <div
                  style={{
                    padding: '1.1rem 1.2rem 1.3rem',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    gap: '0.6rem',
                  }}
                >
                  {question.options.map((option) => {
                    const active = answers[question.key] === option.id;
                    return (
                      <motion.button
                        key={option.id}
                        type="button"
                        onClick={() =>
                          setAnswers((previous) => ({ ...previous, [question.key]: option.id }))
                        }
                        whileHover={prefersReducedMotion ? {} : { y: -2 }}
                        whileTap={prefersReducedMotion ? {} : { scale: 0.97 }}
                        style={{
                          textAlign: 'left',
                          padding: '0.7rem 0.85rem',
                          borderRadius: 'var(--eco-radius-sm)',
                          cursor: 'pointer',
                          fontSize: '0.86rem',
                          fontWeight: active ? 600 : 500,
                          color: active ? '#fff' : 'var(--eco-text)',
                          border: active ? `1px solid ${question.color}` : '1px solid var(--eco-border)',
                          background: active ? question.color : 'transparent',
                          display: 'block',
                          transition: 'background 0.18s ease, border-color 0.18s ease, color 0.18s ease',
                        }}
                      >
                        <span
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.4rem',
                          }}
                        >
                          {option.label}
                          {active && <Check size={15} style={{ flexShrink: 0 }} />}
                        </span>

                        {/* the assumption behind the number, so the estimate is
                            checkable rather than something to be taken on faith */}
                        <span
                          style={{
                            display: 'block',
                            fontSize: '0.72rem',
                            marginTop: '0.25rem',
                            lineHeight: 1.4,
                            opacity: active ? 0.85 : 0.6,
                            color: active ? '#fff' : 'var(--eco-text-muted)',
                          }}
                        >
                          {option.detail} · {option.kg} kg
                        </span>
                      </motion.button>
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
              <span
                className="eco-text-muted"
                style={{ fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}
              >
                Your estimate
              </span>

              <div
                ref={totalRef}
                className="eco-gradient-text"
                style={{
                  fontFamily: 'Space Grotesk, sans-serif',
                  fontWeight: 700,
                  fontSize: 'clamp(2.6rem, 8vw, 3.6rem)',
                  lineHeight: 1,
                  margin: '0.7rem 0 0.2rem',
                }}
              >
                {totalShown}
              </div>
              <div className="eco-text-muted" style={{ fontSize: '0.9rem', marginBottom: '1.2rem' }}>
                kg CO₂ / month {!allAnswered && '(so far)'}
              </div>

              {/* budget bar - only once every question is in. Showing "63% of a
                  climate-safe footprint" after one answer reads as reassurance
                  when it is really just an incomplete sum. */}
              {allAnswered && (
                <motion.div
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.74rem',
                      marginBottom: '0.4rem',
                    }}
                  >
                    <span className="eco-text-muted">vs a climate-safe footprint</span>
                    <span style={{ fontWeight: 700, color: overBudget ? 'var(--eco-orange)' : 'var(--eco-primary)' }}>
                      {budgetPct}%
                    </span>
                  </div>
                  <div
                    style={{
                      height: 10,
                      borderRadius: 999,
                      background: 'var(--eco-border)',
                      overflow: 'hidden',
                      marginBottom: '0.5rem',
                    }}
                  >
                    <motion.div
                      animate={{ width: `${Math.min(budgetPct, 100)}%` }}
                      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
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
                </motion.div>
              )}

              {/* breakdown */}
              {breakdown.length > 0 && (
                <div style={{ display: 'grid', gap: '0.6rem', marginBottom: '1.3rem', textAlign: 'left' }}>
                  {breakdown.map((part) => (
                    <motion.div
                      key={part.key}
                      initial={prefersReducedMotion ? false : { opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '0.74rem',
                          marginBottom: '0.2rem',
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span
                            style={{ width: 8, height: 8, borderRadius: 2, background: part.color, flexShrink: 0 }}
                          />
                          {part.choice}
                        </span>
                        <span className="eco-tabular eco-text-muted">{part.kg} kg</span>
                      </div>
                      <div
                        style={{
                          height: 6,
                          borderRadius: 999,
                          background: 'var(--eco-border)',
                          overflow: 'hidden',
                        }}
                      >
                        <motion.div
                          animate={{ width: `${(part.kg / maxPart) * 100}%` }}
                          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                          style={{ height: '100%', borderRadius: 999, background: part.color }}
                        />
                      </div>
                    </motion.div>
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
                <p
                  className="eco-text-muted"
                  style={{
                    fontSize: '0.86rem',
                    margin: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  <Sparkles size={14} style={{ color: 'var(--eco-primary)' }} />
                  Answer all four to see the full picture
                </p>
              )}
            </div>
          </div>

          {/* what this does and does not count */}
          <div
            style={{
              marginTop: '0.9rem',
              padding: '0.8rem 0.95rem',
              borderRadius: 'var(--eco-radius-sm)',
              border: '1px solid var(--eco-border)',
              display: 'flex',
              gap: '0.6rem',
              alignItems: 'flex-start',
            }}
          >
            <Info size={14} style={{ color: 'var(--eco-primary)', flexShrink: 0, marginTop: 2 }} />
            <p className="eco-text-muted" style={{ fontSize: '0.75rem', lineHeight: 1.6, margin: 0 }}>
              Every figure here comes from the same published factors the Calculator
              uses — DEFRA 2023, CEA India 2023 and Our World in Data — applied to the
              assumption shown under each answer. It covers four of the seven
              categories EcoTrack tracks, leaving out fuel, waste and water, so a real
              tracked month usually comes out <strong>higher</strong> than this.
            </p>
          </div>

          <p
            className="eco-text-muted"
            style={{
              fontSize: '0.72rem',
              textAlign: 'center',
              marginTop: '0.7rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.35rem',
            }}
          >
            <Leaf size={12} />
            A rough estimate — your real footprint depends on the details.
          </p>
        </div>
      </div>
    </div>
  );
}
