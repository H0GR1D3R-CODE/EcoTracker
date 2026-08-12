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
//
// ---------------------------------------------------------------------------
// THIS PAGE IN THE INSTRUMENT SYSTEM
//
// Estimate is the lead magnet: for most visitors it is the second page they
// ever see, straight off the landing page. It was still wearing the old
// dark-designed treatment - an aurora wash behind a centred hero, a badge pill,
// photo headers scrimmed to 88% black so white type would sit on them, a glow
// orb behind the result, and the headline figure set as gradient Space Grotesk.
// Against the restyled Home that seam was the first thing a visitor met.
//
// It now follows the same three rules as Home:
//   * a measured value is mono and amber, never the colour of the thing it
//     measures - and on this page the estimate IS the product, so it is the
//     single largest piece of amber on the site
//   * a rule, not a card, separates things; each question is a channel
//   * photographs are captioned, never scrimmed
// ---------------------------------------------------------------------------

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Car,
  Check,
  Info,
  ShoppingBag,
  UtensilsCrossed,
  Zap,
} from 'lucide-react';

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

// The category accents are variables, not hexes. They were hardcoded here
// (#4fbe80, #a4739e, #e0a23f, #d9694e) - the dark-theme values - so on the
// light ground every selected option was a saturated block of colour chosen
// against a background it was no longer sitting on. transport's #4fbe80
// measures 2.10:1 on paper. The variables carry a measured value per theme.
const QUESTIONS = [
  {
    key: 'transport',
    label: 'How do you usually get around?',
    icon: Car,
    color: 'var(--cat-transport)',
    source: 'DEFRA 2023',
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
    color: 'var(--cat-diet)',
    source: 'Our World in Data',
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
    color: 'var(--cat-electricity)',
    source: 'CEA India 2023',
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
    color: 'var(--cat-consumption)',
    source: 'Lifecycle averages',
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

  // The scale the budget bar is drawn against. It has to hold BOTH the reading
  // and the climate-safe mark with room to spare, or the mark ends up welded to
  // the right-hand edge and stops reading as a line the value crosses.
  const scaleMax = Math.max(total, MONTHLY_BUDGET) * 1.18;
  const pos = (value) => `${(value / scaleMax) * 100}%`;

  return (
    <div style={{ paddingBottom: '5rem' }}>
      {/* ================= HERO ================= */}
      {/* The AuroraBackground that used to wash this section is gone, with the
          badge pill and the centred column. All three were dark-page devices:
          coloured light bleeding across a near-black ground, and a hero
          arrangement that every SaaS landing page ships. Ranged left, same as
          every other page's hero. */}
      <section style={{ padding: 'clamp(3rem, 8vw, 5rem) 0 clamp(1.5rem, 4vw, 2.5rem)' }}>
        <div className="container">
          <div style={{ maxWidth: 940 }}>
            {/* Instrument notation instead of a pill. The one number that
                frames the whole page: the monthly budget the answer gets
                measured against. Stating it up front means the result is a
                reading on a scale the visitor already knows, not a verdict
                sprung on them at the end. */}
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.85rem',
                flexWrap: 'wrap',
                marginBottom: '2rem',
              }}
            >
              <span className="eco-marker">Climate-safe budget</span>
              <span className="eco-readout" style={{ fontSize: '0.86rem', fontWeight: 600 }}>
                {MONTHLY_BUDGET} KG / MONTH
              </span>
              <span className="eco-marker" style={{ opacity: 0.6 }}>per person, 1.5 °C</span>
              <span style={{ width: 46, height: 1, background: 'var(--rule-strong)' }} />
            </motion.div>

            <motion.h1
              initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
              className="eco-display"
              style={{ fontSize: 'clamp(2.6rem, 8vw, 5.2rem)', margin: '0 0 1.4rem' }}
            >
              What&rsquo;s your <span className="eco-gradient-text">footprint?</span>
            </motion.h1>

            <motion.p
              initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="eco-text-muted"
              style={{ fontSize: 'clamp(1rem, 2.2vw, 1.15rem)', maxWidth: '54ch', margin: 0 }}
            >
              Four questions, thirty seconds, no account. Every answer states the
              assumption behind it and applies the same published factor the
              Calculator uses — so the number that appears is one you can check.
            </motion.p>

            {/* Progress as four segments, not a percentage bar.
                A gradient pill filling to 25% says almost nothing; four discrete
                marks say "there are four of these, you have done one" at a
                glance, which is the only thing a visitor wants to know here. */}
            <div style={{ marginTop: '2.6rem', maxWidth: 380 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  marginBottom: '0.6rem',
                }}
              >
                <span className="eco-marker">Answered</span>
                <span className="eco-readout" style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                  {String(answeredCount).padStart(2, '0')} / {String(QUESTIONS.length).padStart(2, '0')}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {QUESTIONS.map((question, index) => (
                  <div
                    key={question.key}
                    style={{
                      flex: 1,
                      height: 3,
                      background:
                        index < answeredCount ? 'var(--readout)' : 'var(--rule-strong)',
                      transition: 'background-color 0.3s ease',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container">
        <div className="eco-estimate-grid">
          {/* ---------- questions ---------- */}
          <div style={{ display: 'grid', gap: '3rem' }}>
            {QUESTIONS.map((question, index) => {
              const Icon = question.icon;
              const answered = Boolean(answers[question.key]);
              return (
                <motion.div
                  key={question.key}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 22 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.15 }}
                  transition={{ duration: 0.45, delay: index * 0.05 }}
                  // A channel, not a card. The top rule takes the category's
                  // colour once the question is answered, so the page registers
                  // its own state along the same hairlines it is built from -
                  // no badge, no tick in a corner, no card border lighting up.
                  style={{
                    paddingTop: '1.05rem',
                    borderTop: `1px solid ${answered ? question.color : 'var(--rule-strong)'}`,
                    transition: 'border-color 0.35s ease',
                  }}
                >
                  {/* The plate. Captioned by the question below it rather than
                      carrying the question on top of an 88%-black scrim - the
                      scrim existed only to make white type legible over a
                      photograph, which meant darkening every image on the page
                      to solve a problem that goes away when the words move. */}
                  <div
                    className="eco-photo-zoom"
                    style={{
                      position: 'relative',
                      overflow: 'hidden',
                      borderRadius: 'var(--eco-radius-sm)',
                      aspectRatio: '16 / 5',
                      marginBottom: '1.1rem',
                    }}
                  >
                    <Photo
                      id={PHOTOS[QUESTION_PHOTOS[question.key]]}
                      alt=""
                      width={900}
                      color={question.color}
                      className="eco-photo-cover"
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                    />
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.6rem',
                      marginBottom: '0.75rem',
                    }}
                  >
                    <span
                      className="eco-readout"
                      style={{ fontSize: '0.85rem', fontWeight: 600 }}
                    >
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="eco-marker" style={{ fontSize: '0.64rem' }}>
                        {question.source}
                      </span>
                      {answered ? (
                        <Check size={17} style={{ color: question.color, flexShrink: 0 }} />
                      ) : (
                        <Icon size={17} style={{ color: question.color, flexShrink: 0 }} />
                      )}
                    </span>
                  </div>

                  <h2
                    className="eco-display"
                    style={{ fontSize: 'clamp(1.35rem, 2.6vw, 1.7rem)', margin: '0 0 1.2rem' }}
                  >
                    {question.label}
                  </h2>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))',
                      gap: '0.7rem',
                    }}
                  >
                    {question.options.map((option) => {
                      const active = answers[question.key] === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() =>
                            setAnswers((previous) => ({ ...previous, [question.key]: option.id }))
                          }
                          aria-pressed={active}
                          // Without this the button's name is composed from its
                          // contents in visual order, so a screen reader
                          // announces "106, kg / mo, Mostly by car" - the
                          // number before the thing it is choosing between.
                          aria-label={`${option.label} — ${option.detail}, ${option.kg} kg CO2 per month`}
                          // Selected no longer means "flood the button with the
                          // category colour and set the label in white". That
                          // reversed the type colour on a saturated ground,
                          // which is exactly the combination that fails contrast
                          // once the accent darkens for the light theme. The
                          // tint stays under 14% and the label keeps the page's
                          // own text colour, so it is legible in both themes and
                          // the selection still reads instantly.
                          style={{
                            textAlign: 'left',
                            padding: '0.8rem 0.9rem',
                            borderRadius: 'var(--eco-radius-sm)',
                            cursor: 'pointer',
                            color: 'var(--eco-text)',
                            border: `1px solid ${active ? question.color : 'var(--rule)'}`,
                            background: active
                              ? `color-mix(in srgb, ${question.color} 12%, transparent)`
                              : 'transparent',
                            transition:
                              'background-color 0.2s ease, border-color 0.2s ease',
                          }}
                        >
                          {/* The reading first. Four options side by side are
                              really four numbers being compared, so the numbers
                              lead and the labels explain them - the same order
                              the category channels use on Home. */}
                          <span
                            style={{
                              display: 'flex',
                              alignItems: 'baseline',
                              justifyContent: 'space-between',
                              gap: '0.4rem',
                            }}
                          >
                            <span className="eco-readout" style={{ fontSize: '1.15rem', fontWeight: 500 }}>
                              {option.kg}
                            </span>
                            <span className="eco-marker" style={{ fontSize: '0.6rem' }}>
                              kg / mo
                            </span>
                          </span>

                          <span
                            className="eco-display"
                            style={{
                              display: 'block',
                              fontSize: '0.92rem',
                              fontWeight: 600,
                              margin: '0.6rem 0 0.2rem',
                              letterSpacing: '-0.02em',
                            }}
                          >
                            {option.label}
                          </span>

                          {/* the assumption behind the number, so the estimate is
                              checkable rather than something to be taken on faith */}
                          <span
                            className="eco-text-muted"
                            style={{
                              display: 'block',
                              fontSize: '0.72rem',
                              lineHeight: 1.45,
                            }}
                          >
                            {option.detail}
                          </span>
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
            {/* The readout panel. No card, no glow orb behind it: the orb was
                the last piece of dark-page lighting on this page, and a green
                radial bloom on paper reads as a smudge rather than as light.
                A double rule top and bottom marks this off as the instrument's
                own panel - the way a gauge is bezelled into a dashboard. */}
            <div
              style={{
                borderTop: '2px solid var(--readout)',
                paddingTop: '1.1rem',
              }}
            >
              <span className="eco-marker">Your estimate</span>

              <div
                ref={totalRef}
                className="eco-readout"
                style={{
                  fontSize: 'clamp(3.2rem, 9vw, 4.6rem)',
                  fontWeight: 500,
                  lineHeight: 0.95,
                  margin: '0.7rem 0 0.35rem',
                }}
              >
                {totalShown}
              </div>
              <div className="eco-marker" style={{ display: 'block' }}>
                kg CO₂ / month{!allAnswered && ' · so far'}
              </div>

              {/* The budget as a scale with the climate-safe line marked on it,
                  rather than a percentage of a bar that fills to 100% and stops.
                  A footprint can exceed the budget - that is the whole point of
                  having one - so the scale has to be able to show it, and the
                  part beyond the line is drawn as an overrange rather than
                  silently clipped at the end of the track. */}
              {allAnswered && (
                <motion.div
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  style={{ marginTop: '1.6rem' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                      marginBottom: '0.55rem',
                    }}
                  >
                    <span className="eco-marker">of the climate-safe budget</span>
                    <span className="eco-readout" style={{ fontSize: '0.92rem', fontWeight: 600 }}>
                      {budgetPct}%
                    </span>
                  </div>

                  <div
                    style={{
                      position: 'relative',
                      height: 12,
                      background: 'var(--rule)',
                      borderRadius: 2,
                      overflow: 'hidden',
                    }}
                  >
                    {/* the reading, up to the line */}
                    <motion.div
                      animate={{ width: pos(Math.min(total, MONTHLY_BUDGET)) }}
                      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                      style={{
                        position: 'absolute',
                        inset: '0 auto 0 0',
                        background: 'var(--readout)',
                      }}
                    />
                    {/* the overrange, beyond it */}
                    {overBudget && (
                      <motion.div
                        animate={{ width: pos(total - MONTHLY_BUDGET) }}
                        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                        style={{
                          position: 'absolute',
                          top: 0,
                          bottom: 0,
                          left: pos(MONTHLY_BUDGET),
                          background: 'var(--eco-danger)',
                        }}
                      />
                    )}
                    {/* the climate-safe line itself. Green, because it is the
                        thing at stake rather than a quantity being reported. */}
                    <span
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: pos(MONTHLY_BUDGET),
                        width: 2,
                        background: 'var(--eco-primary)',
                      }}
                    />
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginTop: '0.45rem',
                    }}
                  >
                    <span className="eco-marker" style={{ fontSize: '0.62rem' }}>
                      0
                    </span>
                    <span
                      className="eco-marker"
                      style={{ fontSize: '0.62rem', color: 'var(--eco-primary)' }}
                    >
                      {MONTHLY_BUDGET} climate-safe
                    </span>
                  </div>
                </motion.div>
              )}

              {/* breakdown */}
              {breakdown.length > 0 && (
                <div style={{ display: 'grid', gap: '0.85rem', margin: '1.8rem 0 0' }}>
                  <span className="eco-marker" style={{ fontSize: '0.64rem' }}>
                    Where it comes from
                  </span>
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
                          alignItems: 'baseline',
                          justifyContent: 'space-between',
                          gap: '0.6rem',
                          fontSize: '0.8rem',
                          marginBottom: '0.3rem',
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                          <span
                            aria-hidden="true"
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: 2,
                              background: part.color,
                              flexShrink: 0,
                            }}
                          />
                          {part.choice}
                        </span>
                        <span className="eco-readout" style={{ fontSize: '0.82rem', fontWeight: 500 }}>
                          {part.kg}
                        </span>
                      </div>
                      <div style={{ height: 4, background: 'var(--rule)' }}>
                        <motion.div
                          animate={{ width: `${(part.kg / maxPart) * 100}%` }}
                          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                          style={{ height: '100%', background: part.color }}
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
                  style={{ marginTop: '1.8rem' }}
                >
                  <p style={{ fontSize: '0.9rem', lineHeight: 1.6, margin: '0 0 1rem' }}>
                    {overBudget
                      ? 'Above the line — but this is just an estimate. Track it precisely and watch it drop.'
                      : 'Nicely done. Track it precisely to keep it there and go further.'}
                  </p>
                  <Link
                    to="/register"
                    className="eco-btn eco-btn-primary eco-btn-pulse"
                    style={{ width: '100%' }}
                  >
                    Track it for real — free
                    <ArrowRight size={17} />
                  </Link>
                </motion.div>
              ) : (
                <p
                  className="eco-text-muted"
                  style={{ fontSize: '0.86rem', margin: '1.6rem 0 0', lineHeight: 1.6 }}
                >
                  Answer all four and the scale appears, with your reading against
                  the climate-safe line.
                </p>
              )}
            </div>

            {/* what this does and does not count */}
            <div
              style={{
                marginTop: '1.6rem',
                paddingTop: '0.9rem',
                borderTop: '1px solid var(--rule)',
                display: 'flex',
                gap: '0.6rem',
                alignItems: 'flex-start',
              }}
            >
              <Info size={14} style={{ color: 'var(--eco-primary)', flexShrink: 0, marginTop: 3 }} />
              <p className="eco-text-muted" style={{ fontSize: '0.75rem', lineHeight: 1.6, margin: 0 }}>
                Every figure here comes from the same published factors the Calculator
                uses — DEFRA 2023, CEA India 2023 and Our World in Data — applied to the
                assumption shown under each answer. It covers four of the seven
                categories EcoTrack tracks, leaving out fuel, waste and water, so a real
                tracked month usually comes out <strong>higher</strong> than this.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
