// EcoTrack/frontend/src/pages/Calculator.jsx
// Where emissions get logged - the only way data enters the application.
//
// HOW THE LIVE PREVIEW WORKS, AND WHY IT IS NOT THE REAL CALCULATION
// As the user types a quantity, the panel on the right immediately shows what
// that would emit. That figure is worked out in the browser, purely so there is
// no wait between typing and seeing a result.
//
// It is NOT what gets saved. On submit, the quantity goes to Flask, Flask reads
// the factor from Firestore itself, multiplies, and stores its own answer. The
// browser's preview and the backend's saved value agree because both use the
// same factor - but the backend is the one that counts. A user editing
// JavaScript in their browser cannot fake a low emission figure.
//
// Mounted at /calculator

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { AlertCircle, CheckCircle2, Info, Loader2, Plus } from 'lucide-react';

import { carbonApi, factorsApi, getErrorMessage } from '../utils/api';
import { useTheme } from '../context/ThemeContext';
import GoalRing from '../components/GoalRing';
import ImpactEquivalents from '../components/ImpactEquivalents';
import SelectField from '../components/SelectField';
import SkeletonCard from '../components/SkeletonCard';
import PageBanner from '../components/PageBanner';
import Reveal from '../components/Reveal';
import QuickLogChips from '../components/QuickLogChips';
import BillScanner from '../components/BillScanner';
import { CATEGORY_ICONS } from '../utils/categoryIcons';
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  calculateEmission,
  getSeverity,
  validateQuantity,
  validateRecordDate,
} from '../utils/emissionHelpers';
import {
  currentMonthISO,
  formatEmission,
  formatNumber,
  formatRelativeDate,
  formatSubType,
  todayISO,
} from '../utils/formatters';

// Quick amounts offered under the quantity box, keyed by the FACTOR'S unit
// rather than the category: the sensible jumps depend on what is being counted,
// and 5 km, 5 kWh and 5 meals are nothing like each other. Every value here is
// a plausible single entry - a commute, a month's electricity, a week of meals.
const QUICK_AMOUNTS = {
  km: [5, 10, 25, 50],
  kWh: [10, 50, 100, 200],
  kg: [1, 5, 10, 25],
  liter: [1, 5, 10, 20],
  meal: [1, 2, 3, 7],
  item: [1, 2, 3, 5],
};

// A climate-safe personal footprint is ~2 tonnes a year, so ~167 kg a month.
//
// MONTHLY, not daily, and that matters. An entry does not represent a day: an
// electricity reading is usually a whole month's bill, and a laptop is a one-off
// whose footprint is spread over years. Measured against a DAILY allowance a
// 100 kWh bill reads "1296%", which is alarming and meaningless. Against the
// month it reads 43%, which is both true and useful - a contribution to the
// month, with no claim about how long the activity took.
const MONTHLY_BUDGET_KG = 2000 / 12;

export default function Calculator() {
  const { prefersReducedMotion } = useTheme();

  // --- emission factors, loaded once from the public API ---
  const [factors, setFactors] = useState(null);
  const [loadingFactors, setLoadingFactors] = useState(true);
  const [factorsError, setFactorsError] = useState(null);

  // --- the form ---
  const [category, setCategory] = useState('transport');
  const [subType, setSubType] = useState('');
  const [quantity, setQuantity] = useState('');
  const [recordedDate, setRecordedDate] = useState(todayISO());
  const [touched, setTouched] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // --- what came back from the last successful submit ---
  const [result, setResult] = useState(null);

  // --- this month's entries, shown underneath ---
  const [recentRecords, setRecentRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  // ---------------------------------------------------------------------
  // Load the factors
  // ---------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    factorsApi
      .getAll()
      .then((data) => {
        if (cancelled) return;
        setFactors(data);
        setFactorsError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setFactorsError(getErrorMessage(error, 'Could not load emission factors.'));
      })
      .finally(() => {
        if (!cancelled) setLoadingFactors(false);
      });

    // Guards against setting state after the user has navigated away
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------------------------------------------------------------------
  // Load this month's records
  // ---------------------------------------------------------------------
  const loadRecords = async () => {
    setLoadingRecords(true);
    try {
      const data = await carbonApi.getRecords({ month: currentMonthISO() });
      setRecentRecords(data.records || []);
    } catch (error) {
      // The toast for server errors is already handled by the axios interceptor
      setRecentRecords([]);
    } finally {
      setLoadingRecords(false);
    }
  };

  useEffect(() => {
    loadRecords();
    // Runs once on mount; loadRecords is re-created each render but we only
    // ever want the initial fetch here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Every sub-type available in the selected category
  const availableSubTypes = useMemo(() => {
    if (!factors?.factors) return [];
    return factors.factors[category] || [];
  }, [factors, category]);

  // Whenever the category changes, select its first sub-type so the form is
  // never sitting in an invalid half-chosen state
  useEffect(() => {
    if (availableSubTypes.length > 0) {
      setSubType(availableSubTypes[0].subType);
    } else {
      setSubType('');
    }
  }, [availableSubTypes]);

  // The factor object behind the current selection
  const selectedFactor = useMemo(
    () => availableSubTypes.find((item) => item.subType === subType) || null,
    [availableSubTypes, subType]
  );

  // THE LIVE PREVIEW - recalculated on every keystroke
  const previewEmission = calculateEmission(quantity, selectedFactor?.factorValue);
  const previewSeverity = getSeverity(previewEmission);

  // --- validation ---
  const errors = {
    quantity: validateQuantity(quantity),
    recordedDate: validateRecordDate(recordedDate),
    subType: subType ? null : 'Please choose an option.',
  };
  const isValid = !errors.quantity && !errors.recordedDate && !errors.subType;

  const handleCategoryChange = (nextCategory) => {
    setCategory(nextCategory);
    // Clearing the result stops a card about transport hanging around after the
    // user has moved on to logging electricity
    setResult(null);
    setTouched({});
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setTouched({ quantity: true, recordedDate: true, subType: true });
    if (!isValid || submitting || !selectedFactor) return;

    setSubmitting(true);

    try {
      const data = await carbonApi.calculate({
        category,
        subType,
        quantity: parseFloat(quantity),
        unit: selectedFactor.unit,
        recordedDate,
      });

      setResult(data);
      toast.success(`Logged ${formatEmission(data.emissionKgco2)}`);

      // Clear the quantity so the next entry can be typed straight away, but
      // keep the category, sub-type and date - people usually log several
      // similar things in one sitting
      setQuantity('');
      setTouched({});

      loadRecords();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not save that entry.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (recordId) => {
    setDeletingId(recordId);
    try {
      await carbonApi.deleteRecord(recordId);
      toast.success('Entry deleted.');
      // Remove it locally rather than re-fetching - it feels instant, and the
      // backend has already confirmed the delete succeeded
      setRecentRecords((current) => current.filter((record) => record.id !== recordId));
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not delete that entry.'));
    } finally {
      setDeletingId(null);
    }
  };

  const fieldClass = (field) => {
    if (!touched[field]) return '';
    return errors[field] ? 'is-invalid' : 'is-valid';
  };

  const meta = CATEGORY_META[category];

  // ---------------------------------------------------------------------
  // Loading and error states
  // ---------------------------------------------------------------------
  if (loadingFactors) {
    return (
      <div className="container" style={{ paddingTop: '2.5rem', paddingBottom: '3rem' }}>
        <div
          className="eco-skeleton"
          style={{ width: 280, height: 34, borderRadius: 8, marginBottom: '2rem' }}
        />
        <SkeletonCard lines={5} height={340} />
      </div>
    );
  }

  if (factorsError) {
    return (
      <div className="container" style={{ paddingTop: '3rem', paddingBottom: '3rem' }}>
        {/* A channel under a danger rule, matching the Dashboard's own failed
            read. The instrument reporting that it cannot take a reading. */}
        <div style={{ maxWidth: 560, paddingTop: '1.1rem', borderTop: '2px solid var(--eco-danger)' }}>
          <AlertCircle size={22} style={{ color: 'var(--eco-danger)', display: 'block', marginBottom: '0.9rem' }} />
          <span className="eco-marker" style={{ display: 'block', marginBottom: '0.6rem' }}>
            No factors
          </span>
          <h2 className="eco-display" style={{ fontSize: 'clamp(1.6rem, 3.6vw, 2.2rem)', margin: '0 0 0.7rem' }}>
            Could not load emission factors
          </h2>
          <p className="eco-text-muted" style={{ fontSize: '0.92rem', margin: 0 }}>
            {factorsError}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingTop: '2.5rem', paddingBottom: '3.5rem' }}>
      <PageBanner
        photo="calcNature"
        alt="Sunlight falling through a green forest"
        color="var(--org-onetree)"
        eyebrow="Measure your impact"
        title="Carbon"
        titleAccent="Calculator"
        subtitle="Pick a category, enter what you did, and see the emissions before you save."
      />

      {/* ============ CATEGORY TABS ============ */}
      <div
        style={{
          display: 'flex',
          gap: '0.4rem',
          marginBottom: '1.8rem',
          // Seven tabs will not fit across a phone, so the row scrolls sideways
          overflowX: 'auto',
          paddingBottom: '0.4rem',
        }}
      >
        {CATEGORY_ORDER.map((key) => {
          const Icon = CATEGORY_ICONS[key];
          const isActive = key === category;
          const categoryMeta = CATEGORY_META[key];

          return (
            <button
              key={key}
              type="button"
              onClick={() => handleCategoryChange(key)}
              style={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.6rem 1rem',
                borderRadius: 'var(--eco-radius-sm)',
                border: '1px solid',
                borderColor: isActive ? `color-mix(in srgb, ${categoryMeta.color} 33%, transparent)` : 'var(--eco-border)',
                background: 'transparent',
                color: isActive ? categoryMeta.color : 'var(--eco-text-muted)',
                fontWeight: isActive ? 600 : 500,
                fontSize: '0.86rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'color 0.25s ease, border-color 0.25s ease',
              }}
            >
              {/* layoutId is what makes the highlight SLIDE from the old tab to
                  the new one. Framer Motion sees the same id disappear in one
                  place and appear in another, and animates between them. */}
              {isActive && !prefersReducedMotion && (
                <motion.span
                  layoutId="calculator-tab-highlight"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 'var(--eco-radius-sm)',
                    background: `color-mix(in srgb, ${categoryMeta.color} 9%, transparent)`,
                    zIndex: 0,
                  }}
                />
              )}

              <span style={{ position: 'relative', zIndex: 1, display: 'flex', gap: '0.45rem' }}>
                <Icon size={16} />
                {categoryMeta.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* One-tap re-logging for anything you do often, plus habit-mined
          suggestions - see components/QuickLogChips.jsx. */}
      <QuickLogChips onLogged={loadRecords} />

      {/* ============ FORM + LIVE PREVIEW ============ */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
          gap: '2rem',
          marginBottom: '2.5rem',
        }}
      >
        {/* ---------- form ---------- */}
        {/* The form keeps a card: it is the control surface of the page, and a
            control surface earns an edge. What it loses is .eco-card-accent,
            whose 3px left strip was a fixed primary-to-teal gradient - a strip
            of brand colour down a panel whose whole job is to be about ONE
            category at a time. The category is stated in the marker instead. */}
        <div className="eco-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.7rem' }}>
            <span
              aria-hidden="true"
              style={{ width: 7, height: 7, borderRadius: 2, background: meta.color, flexShrink: 0 }}
            />
            <span className="eco-marker">{meta.label}</span>
          </div>
          <p className="eco-text-muted" style={{ fontSize: '0.86rem', marginBottom: '1.5rem' }}>
            {meta.description}
          </p>

          <BillScanner
            onExtracted={({ category: extractedCategory, subType: extractedSubType, quantity: extractedQuantity }) => {
              if (extractedCategory && extractedCategory !== category) {
                handleCategoryChange(extractedCategory);
              }
              if (extractedSubType) setSubType(extractedSubType);
              if (extractedQuantity) setQuantity(String(extractedQuantity));
            }}
          />

          <form className="eco-form" onSubmit={handleSubmit} noValidate>
            {/* Sub-type. The factor goes in the hint line rather than the label,
                so the option reads as a name with its evidence underneath
                instead of one long run-on string. */}
            <div className="mb-3">
              <SelectField
                id="calc-subtype"
                label="Type"
                value={subType}
                onChange={setSubType}
                disabled={submitting || availableSubTypes.length === 0}
                options={availableSubTypes.map((item) => ({
                  value: item.subType,
                  label: formatSubType(item.subType),
                  hint: `${item.factorValue} kg CO₂ per ${item.unit} · ${item.source}`,
                }))}
              />
            </div>

            {/* Quantity */}
            <div className="mb-3">
              <div className="form-floating">
                <input
                  type="number"
                  id="calc-quantity"
                  className={`form-control ${fieldClass('quantity')}`}
                  placeholder="0"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  onBlur={() => setTouched((prev) => ({ ...prev, quantity: true }))}
                  min="0"
                  step="any"
                  disabled={submitting}
                />
                <label htmlFor="calc-quantity">
                  {meta.quantityLabel}
                  {selectedFactor ? ` (${selectedFactor.unit})` : ''}
                </label>
              </div>
              {touched.quantity && errors.quantity && (
                <div className="eco-field-error">
                  <AlertCircle size={13} />
                  {errors.quantity}
                </div>
              )}

              {/* Quick amounts for the unit in play. Logging a commute is the
                  thing people do most often here, and typing "25" every day is
                  friction for no reason. Keyed to the unit rather than the
                  category, because the sensible jumps depend on what is being
                  counted - 5 km and 5 kWh are not comparable amounts. */}
              {selectedFactor && QUICK_AMOUNTS[selectedFactor.unit] && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.6rem' }}>
                  {QUICK_AMOUNTS[selectedFactor.unit].map((amount) => {
                    const active = parseFloat(quantity) === amount;
                    return (
                      <motion.button
                        key={amount}
                        type="button"
                        onClick={() => {
                          setQuantity(String(amount));
                          setTouched((prev) => ({ ...prev, quantity: true }));
                        }}
                        whileTap={prefersReducedMotion ? {} : { scale: 0.94 }}
                        disabled={submitting}
                        style={{
                          padding: '0.32rem 0.7rem',
                          borderRadius: 'var(--eco-radius-sm)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.76rem',
                          fontWeight: 500,
                          cursor: 'pointer',
                          border: `1px solid ${active ? meta.color : 'var(--rule)'}`,
                          background: active ? `color-mix(in srgb, ${meta.color} 12%, transparent)` : 'transparent',
                          color: active ? 'var(--eco-text)' : 'var(--eco-text-muted)',
                          transition: 'background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease',
                        }}
                      >
                        {amount} {selectedFactor.unit}
                      </motion.button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Date */}
            <div className="mb-3">
              <div className="form-floating">
                <input
                  type="date"
                  id="calc-date"
                  className={`form-control ${fieldClass('recordedDate')}`}
                  value={recordedDate}
                  onChange={(event) => setRecordedDate(event.target.value)}
                  onBlur={() => setTouched((prev) => ({ ...prev, recordedDate: true }))}
                  // The browser's own picker will not offer future dates, which
                  // stops the error before it can happen
                  max={todayISO()}
                  disabled={submitting}
                />
                <label htmlFor="calc-date">Date</label>
              </div>
              {touched.recordedDate && errors.recordedDate && (
                <div className="eco-field-error">
                  <AlertCircle size={13} />
                  {errors.recordedDate}
                </div>
              )}
            </div>

            <button
              type="submit"
              className="eco-btn eco-btn-primary"
              style={{ width: '100%', marginTop: '0.6rem', padding: '0.85rem' }}
              disabled={submitting || !isValid}
            >
              {submitting ? (
                <>
                  <Loader2 size={17} style={{ animation: 'eco-spin 0.8s linear infinite' }} />
                  Saving…
                </>
              ) : (
                <>
                  <Plus size={17} />
                  Log this emission
                </>
              )}
            </button>

            {selectedFactor?.source && (
              <p
                className="eco-marker"
                style={{
                  fontSize: '0.62rem',
                  marginTop: '1rem',
                  marginBottom: 0,
                  paddingTop: '0.7rem',
                  borderTop: '1px solid var(--rule)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <Info size={12} />
                Factor source: {selectedFactor.source}
              </p>
            )}
          </form>
        </div>

        {/* ---------- live preview ---------- */}
        {/* The panel takes on the current category's colour, so switching
            category is felt rather than just read. */}
        {/* This is the readout of the whole application - the one number the
            page exists to produce, updating as the user types. It was a tinted
            card whose fill and border took the category's colour, with the
            figure set as gradient Space Grotesk.
            Both broke the same rule: the measurement was wearing the colour of
            the thing being measured. It is mono amber under an amber rule now,
            exactly like the estimate on the public Estimate page, and the
            category is carried by the swatch beside the marker instead. */}
        <motion.div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            paddingTop: '1.1rem',
            borderTop: '2px solid var(--readout)',
          }}
        >
          <div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.55rem' }}>
              <motion.span
                aria-hidden="true"
                animate={{ backgroundColor: meta.color }}
                transition={{ duration: 0.35 }}
                style={{ width: 7, height: 7, borderRadius: 2, flexShrink: 0 }}
              />
              <span className="eco-marker">Live preview</span>
            </span>

            {/* The number updates on every keystroke, before anything is saved.
                It pulses on each change so a keystroke visibly moves it - the
                whole point of a live preview is the cause and effect. Keyed on
                the value so React remounts and replays the animation. */}
            <motion.div
              key={previewEmission}
              initial={prefersReducedMotion ? false : { scale: 0.94, opacity: 0.55 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 24 }}
              className="eco-readout"
              style={{
                fontSize: 'clamp(2.6rem, 7.5vw, 4rem)',
                fontWeight: 500,
                lineHeight: 1,
                margin: '0.8rem 0 0.35rem',
                whiteSpace: 'nowrap',
              }}
            >
              {formatNumber(previewEmission, previewEmission < 1 && previewEmission > 0 ? 3 : 2)}
            </motion.div>
            <div className="eco-marker" style={{ display: 'block' }}>
              kg CO₂
            </div>

            {previewEmission > 0 ? (
              <>
                {/* The severity was a glass pill. It is a graded marker now: the
                    band is a judgement about the reading, so it takes the
                    judgement's colour and none of the pill's chrome. */}
                <div
                  style={{
                    marginTop: '1.3rem',
                    paddingTop: '0.7rem',
                    borderTop: `1px solid ${previewSeverity.color}`,
                  }}
                >
                  <span className="eco-marker" style={{ color: previewSeverity.color }}>
                    {previewSeverity.label}
                  </span>
                </div>

                {/* This entry as a share of a climate-safe month. A bare
                    "3.5 kg" means nothing to most people; "2% of your month"
                    does. Capped at 100% so one large entry cannot draw a bar
                    off the end of the card. */}
                <div style={{ marginTop: '1.4rem' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                      marginBottom: '0.45rem',
                    }}
                  >
                    <span className="eco-marker">of a climate-safe month</span>
                    <span className="eco-readout" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                      {/* A decimal below 10%, because a short trip really is a
                          fraction of a per cent and a bare "0%" reads as an
                          error rather than as "genuinely tiny". */}
                      {(() => {
                        const share = (previewEmission / MONTHLY_BUDGET_KG) * 100;
                        return share < 10 ? share.toFixed(1) : Math.round(share);
                      })()}
                      %
                    </span>
                  </div>
                  <div style={{ height: 8, background: 'var(--rule)', overflow: 'hidden' }}>
                    <motion.div
                      animate={{
                        width: `${Math.min((previewEmission / MONTHLY_BUDGET_KG) * 100, 100)}%`,
                      }}
                      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                      style={{ height: '100%', background: 'var(--readout)' }}
                    />
                  </div>
                  <p
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.68rem',
                      color: 'var(--eco-text-muted)',
                      opacity: 0.75,
                      margin: '0.45rem 0 0',
                    }}
                  >
                    A 2-tonne year works out at {formatNumber(MONTHLY_BUDGET_KG, 0)} kg a month.
                  </p>
                </div>

                {/* The working, shown. This is the arithmetic behind the figure
                    above it, so it is set in mono like a line of a calculation
                    rather than as body prose. */}
                {selectedFactor && (
                  <p
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.76rem',
                      color: 'var(--eco-text-muted)',
                      marginTop: '1.2rem',
                      paddingTop: '0.7rem',
                      borderTop: '1px solid var(--rule)',
                      marginBottom: 0,
                    }}
                  >
                    {formatNumber(parseFloat(quantity) || 0, 2)} {selectedFactor.unit} ×{' '}
                    {selectedFactor.factorValue} kg CO₂/{selectedFactor.unit}
                  </p>
                )}
              </>
            ) : (
              <p
                className="eco-text-muted"
                style={{ fontSize: '0.88rem', marginTop: '1.3rem', marginBottom: 0, lineHeight: 1.6 }}
              >
                Enter a quantity to see the emissions update as you type.
              </p>
            )}
          </div>
        </motion.div>
      </div>

      {/* ============ RESULT CARD ============ */}
      {/* AnimatePresence lets the card animate OUT as well as in, which matters
          when the user switches category and the old result is cleared */}
      <AnimatePresence mode="wait">
        {result && (
          <motion.div
            key={result.record?.id}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? {} : { opacity: 0, y: -14 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            style={{ marginBottom: '2.5rem' }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
                gap: '1.5rem',
              }}
            >
              {/* Saved confirmation with the comparison ring */}
              <div style={{ paddingTop: '1.05rem', borderTop: '1px solid var(--rule-strong)' }}>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    color: 'var(--eco-primary)',
                    marginBottom: '1.2rem',
                  }}
                >
                  <CheckCircle2 size={17} />
                  <span className="eco-marker" style={{ color: 'var(--eco-primary)' }}>
                    Saved to your record
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <GoalRing
                    // Capped at 100 so an unusually large entry does not try to
                    // draw more than a full circle
                    percent={Math.min(result.percentOfDailyAverage ?? 0, 100)}
                    size={170}
                    strokeWidth={11}
                    // invert: a big share of your daily average is a warning,
                    // not an achievement
                    invert
                    label={
                      result.percentOfDailyAverage !== null &&
                      result.percentOfDailyAverage !== undefined
                        ? `${Math.round(result.percentOfDailyAverage)}%`
                        : '—'
                    }
                    sublabel="of your daily average"
                  />
                </div>

                <div style={{ marginTop: '1.4rem' }}>
                  {/* The saved figure is the same measured quantity the preview
                      showed a moment ago, so it is set the same way. It was
                      bold Space Grotesk in the page's text colour, which made
                      the number that was actually recorded look less like a
                      reading than the provisional one above it. */}
                  <div className="eco-readout" style={{ fontSize: '1.9rem', fontWeight: 500, lineHeight: 1 }}>
                    {formatEmission(result.emissionKgco2)}
                  </div>
                  <div
                    style={{
                      marginTop: '0.9rem',
                      paddingTop: '0.6rem',
                      borderTop: `1px solid ${getSeverity(result.emissionKgco2).color}`,
                      display: 'inline-block',
                    }}
                  >
                    <span
                      className="eco-marker"
                      style={{ color: getSeverity(result.emissionKgco2).color }}
                    >
                      {getSeverity(result.emissionKgco2).label}
                    </span>
                  </div>
                </div>

                {result.dailyAverage > 0 && (
                  <p
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.7rem',
                      color: 'var(--eco-text-muted)',
                      opacity: 0.8,
                      marginTop: '1.1rem',
                      marginBottom: 0,
                    }}
                  >
                    Your average is {formatEmission(result.dailyAverage)} per day
                    over the last 30 days.
                  </p>
                )}
              </div>

              {/* The pictorial translation of what was just logged */}
              <ImpactEquivalents
                emissionKg={result.emissionKgco2}
                title="What you just logged"
                subtitle={`${formatSubType(subType)} — ${formatEmission(result.emissionKgco2)}`}
                showPictogram={false}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ============ THIS MONTH'S ENTRIES ============ */}
      <Reveal
        once
        style={{ display: 'block', paddingTop: '1.05rem', borderTop: '1px solid var(--rule-strong)' }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: '1.3rem',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <h2 className="eco-display" style={{ fontSize: '1.25rem', margin: 0 }}>
            This month&rsquo;s entries
          </h2>
          {recentRecords.length > 0 && (
            <span className="eco-readout" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
              {String(recentRecords.length).padStart(2, '0')}
            </span>
          )}
        </div>

        {loadingRecords ? (
          <div style={{ display: 'grid', gap: '0.6rem' }}>
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="eco-skeleton"
                style={{ height: 44, borderRadius: 'var(--eco-radius-sm)' }}
              />
            ))}
          </div>
        ) : recentRecords.length === 0 ? (
          <p className="eco-text-muted" style={{ fontSize: '0.9rem', margin: 0 }}>
            Nothing logged this month yet. Your first entry will appear here.
          </p>
        ) : (
          <div className="eco-table-wrap">
            <table className="eco-table">
              <thead>
                <tr>
                  <th>Activity</th>
                  <th>Quantity</th>
                  <th>Emissions</th>
                  <th>Date</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {recentRecords.slice(0, 10).map((record) => {
                  const RecordIcon = CATEGORY_ICONS[record.category] || Car;
                  const recordColor = CATEGORY_META[record.category]?.color || '#8888aa';

                  return (
                    <tr key={record.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <span style={{ color: recordColor, display: 'flex' }}>
                            <RecordIcon size={16} />
                          </span>
                          <span>{formatSubType(record.subType)}</span>
                        </div>
                      </td>
                      <td className="eco-text-muted">
                        {formatNumber(record.quantity, 1)} {record.unit}
                      </td>
                      {/* The one measured value in the row, so it is the one
                          amber cell - it was bold body text, indistinguishable
                          from the quantity beside it. */}
                      <td className="eco-readout" style={{ fontWeight: 500 }}>
                        {formatEmission(record.emissionKgco2)}
                      </td>
                      <td className="eco-text-muted">{formatRelativeDate(record.recordedDate)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => handleDelete(record.id)}
                          disabled={deletingId === record.id}
                          aria-label="Delete entry"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--eco-text-muted)',
                            cursor: 'pointer',
                            // 10, not 6: a 15px icon at 6px padding is a
                            // ~27px tap target, under Apple's 44px HIG
                            // minimum - real risk of mis-tapping the wrong
                            // row's delete button in a dense table on a phone.
                            padding: 10,
                            display: 'inline-flex',
                            borderRadius: 6,
                          }}
                        >
                          {deletingId === record.id ? (
                            <Loader2
                              size={15}
                              style={{ animation: 'eco-spin 0.8s linear infinite' }}
                            />
                          ) : (
                            <Trash2 size={15} />
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Reveal>
    </div>
  );
}
