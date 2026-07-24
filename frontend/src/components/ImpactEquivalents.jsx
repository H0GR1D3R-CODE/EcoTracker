// EcoTrack/frontend/src/components/ImpactEquivalents.jsx
//
// NOTE: this file is an addition to the folder structure in the project plan.
// It exists because the same "what does this actually mean" panel is needed on
// the Dashboard, the Calculator and the Reports page, and copying it three
// times would guarantee the three copies eventually disagreed.
//
// WHAT THIS IS FOR
// "84.2 kg CO₂" is a number almost nobody can picture. The whole behavioural
// point of a carbon tracker is turning that into something imaginable:
// 597 km of driving, 4 trees working for a year, 118 units of electricity.
// That translation is what makes a person change a habit, so it is arguably
// the most important component in the application.
//
// EVERY CONVERSION BELOW IS DERIVED FROM A PUBLISHED EMISSION FACTOR, and the
// derivation is written out next to it so it can be defended in the viva.

import { motion } from 'framer-motion';
import { Car, Lightbulb, Plug, Smartphone, TreePine } from 'lucide-react';

import { useTheme } from '../context/ThemeContext';
import { formatNumber } from '../utils/formatters';

// --- the published factors these conversions are built on ---

// DEFRA 2023: a petrol car emits 0.141 kg CO₂ per kilometre
const PETROL_CAR_KG_PER_KM = 0.141;

// CEA India 2023: the Indian grid emits 0.710 kg CO₂ per kWh ("unit")
const GRID_KG_PER_KWH = 0.71;

// US Forest Service: a mature tree absorbs roughly 21 kg CO₂ per year
const TREE_KG_ABSORBED_PER_YEAR = 21;

// A 9 W LED bulb running for one hour uses 0.009 kWh,
// so it causes 0.009 × 0.710 = 0.00639 kg CO₂
const LED_BULB_KG_PER_HOUR = 0.009 * GRID_KG_PER_KWH;

// Charging a phone is about 0.005 kg CO₂ per full charge
const PHONE_CHARGE_KG = 0.005;

// How many tree icons the pictogram draws at most before it switches to
// "× N" notation - beyond this the row wraps into an unreadable forest
const MAX_TREE_ICONS = 24;

/**
 * Round sensibly for display: big numbers lose their decimals, small ones keep them.
 */
function smartRound(value) {
  if (value >= 100) return Math.round(value);
  if (value >= 10) return Math.round(value * 10) / 10;
  return Math.round(value * 100) / 100;
}

/**
 * @param {number} emissionKg  the CO₂ total to translate
 * @param {string} title
 * @param {string} subtitle
 * @param {boolean} showPictogram  draw the row of tree icons
 */
export default function ImpactEquivalents({
  emissionKg = 0,
  title = 'What that actually means',
  subtitle = '',
  showPictogram = true,
}) {
  const { prefersReducedMotion } = useTheme();

  const total = Number(emissionKg) || 0;

  // Nothing to translate yet - say so plainly rather than showing a row of zeros
  if (total <= 0) {
    return (
      <div className="eco-card">
        <h3 style={{ fontSize: '1.05rem', marginBottom: '0.5rem' }}>{title}</h3>
        <p className="eco-text-muted" style={{ margin: 0, fontSize: '0.9rem' }}>
          Log an activity and this panel will translate it into distances, trees
          and units of electricity.
        </p>
      </div>
    );
  }

  const equivalents = [
    {
      icon: Car,
      color: '#00ff87',
      value: total / PETROL_CAR_KG_PER_KM,
      unit: 'km',
      label: 'Driving a petrol car',
      note: 'at 0.141 kg CO₂ per km (DEFRA 2023)',
    },
    {
      icon: Plug,
      color: '#f59e0b',
      value: total / GRID_KG_PER_KWH,
      unit: 'units',
      label: 'Grid electricity burned',
      note: 'at 0.710 kg CO₂ per kWh (CEA India 2023)',
    },
    {
      icon: Lightbulb,
      color: '#eab308',
      value: total / LED_BULB_KG_PER_HOUR,
      unit: 'hours',
      label: 'A 9 W LED bulb left on',
      note: '0.009 kWh per hour on the Indian grid',
    },
    {
      icon: Smartphone,
      color: '#0ea5e9',
      value: total / PHONE_CHARGE_KG,
      unit: 'charges',
      label: 'Phone charges',
      note: 'about 0.005 kg CO₂ per full charge',
    },
  ];

  // How many trees, working for a full year, it takes to absorb this
  const treesNeeded = total / TREE_KG_ABSORBED_PER_YEAR;
  const wholeTrees = Math.max(1, Math.ceil(treesNeeded));
  const iconsToDraw = Math.min(wholeTrees, MAX_TREE_ICONS);

  // The largest value is used to scale every bar, so the bars are comparable
  // with each other rather than each one filling its own row
  const largestValue = Math.max(...equivalents.map((item) => item.value));

  return (
    <div className="eco-card">
      <h3 style={{ fontSize: '1.05rem', marginBottom: '0.25rem' }}>{title}</h3>
      <p className="eco-text-muted" style={{ fontSize: '0.85rem', marginBottom: '1.4rem' }}>
        {subtitle || `${formatNumber(total, 1)} kg of CO₂, expressed in everyday terms`}
      </p>

      {/* ---------- Tree pictogram ---------- */}
      {showPictogram && (
        <div
          style={{
            padding: '1.1rem',
            borderRadius: 'var(--eco-radius-sm)',
            background: 'rgba(var(--eco-primary-rgb), 0.05)',
            border: '1px solid var(--eco-border)',
            marginBottom: '1.4rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.3rem',
              marginBottom: '0.7rem',
            }}
          >
            {/* One icon per tree. Each pops in slightly after the last, which
                turns a static row into something that reads left to right. */}
            {Array.from({ length: iconsToDraw }).map((_, index) => (
              <motion.span
                key={index}
                initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  duration: 0.35,
                  // Capped so a large forest does not take ten seconds to appear
                  delay: Math.min(index * 0.035, 1.2),
                  ease: [0.22, 1, 0.36, 1],
                }}
                style={{ display: 'flex', color: 'var(--eco-primary)' }}
              >
                <TreePine size={22} />
              </motion.span>
            ))}

            {wholeTrees > MAX_TREE_ICONS && (
              <span
                className="eco-text-muted"
                style={{ alignSelf: 'center', fontSize: '0.85rem', marginLeft: '0.4rem' }}
              >
                + {formatNumber(wholeTrees - MAX_TREE_ICONS, 0)} more
              </span>
            )}
          </div>

          <div style={{ fontSize: '0.9rem' }}>
            <strong style={{ color: 'var(--eco-primary)' }}>
              {formatNumber(wholeTrees, 0)} tree{wholeTrees === 1 ? '' : 's'}
            </strong>{' '}
            <span className="eco-text-muted">
              would need to grow for a full year to absorb this much CO₂
            </span>
          </div>
        </div>
      )}

      {/* ---------- Equivalence bars ---------- */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
        {equivalents.map((item, index) => {
          const Icon = item.icon;
          // Every bar is measured against the largest value in the set
          const fillPercent = largestValue > 0 ? (item.value / largestValue) * 100 : 0;

          return (
            <div key={item.label}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.7rem',
                  marginBottom: '0.45rem',
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 9,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    background: `${item.color}1A`,
                    color: item.color,
                  }}
                >
                  <Icon size={17} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 500 }}>{item.label}</div>
                  <div className="eco-text-muted" style={{ fontSize: '0.74rem' }}>
                    {item.note}
                  </div>
                </div>

                <div
                  style={{
                    fontFamily: 'Space Grotesk, sans-serif',
                    fontWeight: 700,
                    fontSize: '1rem',
                    whiteSpace: 'nowrap',
                    color: item.color,
                  }}
                >
                  {formatNumber(smartRound(item.value), item.value >= 10 ? 0 : 2)}
                  <span
                    className="eco-text-muted"
                    style={{ fontSize: '0.72rem', fontWeight: 600, marginLeft: '0.25rem' }}
                  >
                    {item.unit}
                  </span>
                </div>
              </div>

              {/* The bar itself. Only its width animates, and width on a
                  transform-free element this small is cheap. */}
              <div
                style={{
                  height: 6,
                  borderRadius: 6,
                  background: 'var(--eco-border)',
                  overflow: 'hidden',
                }}
              >
                <motion.div
                  initial={prefersReducedMotion ? false : { width: 0 }}
                  animate={{ width: `${fillPercent}%` }}
                  transition={{
                    duration: 0.9,
                    delay: 0.15 + index * 0.1,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  style={{
                    height: '100%',
                    borderRadius: 6,
                    background: `linear-gradient(90deg, ${item.color}, ${item.color}88)`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
