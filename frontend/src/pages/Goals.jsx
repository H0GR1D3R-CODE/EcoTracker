// EcoTrack/frontend/src/pages/Goals.jsx
// Per-category reduction targets, with live progress.
//
// WHY GOALS ARE PER CATEGORY AND NOT ONE OVERALL TARGET
// "Reduce my emissions by 20%" gives a person nothing to actually do. "Reduce
// transport by 20%" points at a specific behaviour - take the bus twice a week.
// Splitting goals by category is the difference between a number someone
// watches and a number someone can move.
//
// WHERE THE PROGRESS FIGURE COMES FROM
// The browser calculates none of it. GET /api/goals returns progressPercent,
// isAchieved, daysRemaining and the rest already worked out by Flask, which
// recalculates them from the current records on every request. That means a
// goal can never show stale progress the way a stored percentage would.
//
// Mounted at /goals

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import toast from 'react-hot-toast';
import {
  AlertCircle,
  CalendarClock,
  Check,
  Flag,
  Loader2,
  Plus,
  Target,
  Trash2,
  TrendingDown,
  X,
} from 'lucide-react';

import { dashboardApi, getErrorMessage, goalsApi } from '../utils/api';
import { useTheme } from '../context/ThemeContext';
import GoalRing from '../components/GoalRing';
import SelectField from '../components/SelectField';
import SkeletonCard from '../components/SkeletonCard';
import { CATEGORY_META, CATEGORY_ORDER } from '../utils/emissionHelpers';
import { formatCategory, formatDate, formatEmission, formatNumber } from '../utils/formatters';

// The reduction targets offered in the form. Free-text entry invites 3% goals
// that are not worth setting and 95% goals nobody will ever hit.
const REDUCTION_OPTIONS = [5, 10, 15, 20, 25, 30, 40, 50];

/**
 * Fire the celebration. Two bursts from opposite sides looks considerably
 * better than one from the middle, which reads as a single sad puff.
 */
function celebrate() {
  const settings = {
    particleCount: 70,
    spread: 68,
    startVelocity: 42,
    ticks: 220,
    colors: ['#00ff87', '#00c96b', '#7c3aed', '#f0f0f0'],
    disableForReducedMotion: true, // canvas-confetti honours the OS setting itself
  };

  confetti({ ...settings, origin: { x: 0.2, y: 0.65 } });
  // A short delay between the two makes it feel like a celebration rather
  // than a single symmetrical event
  setTimeout(() => confetti({ ...settings, origin: { x: 0.8, y: 0.65 } }), 180);
}

/**
 * A horizontal timeline: goal created, today, deadline.
 * The marker sits at today's position as a fraction of the whole period.
 */
function GoalTimeline({ createdAt, targetDate, daysRemaining }) {
  const start = createdAt ? new Date(createdAt) : null;
  const end = targetDate ? new Date(targetDate) : null;

  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  const totalMs = end - start;
  const elapsedMs = Date.now() - start;

  // Clamped so an overdue goal shows the marker parked at the end rather than
  // escaping off the right-hand side of the bar
  const elapsedPercent =
    totalMs > 0 ? Math.max(0, Math.min(100, (elapsedMs / totalMs) * 100)) : 100;

  const overdue = daysRemaining !== null && daysRemaining < 0;

  return (
    <div style={{ marginTop: '1.1rem' }}>
      <div
        style={{
          position: 'relative',
          height: 4,
          borderRadius: 4,
          background: 'var(--eco-border)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: `${elapsedPercent}%`,
            borderRadius: 4,
            background: overdue
              ? 'var(--eco-danger)'
              : 'linear-gradient(90deg, var(--eco-primary), var(--eco-purple))',
          }}
        />

        {/* "You are here" marker */}
        <div
          style={{
            position: 'absolute',
            top: -4,
            left: `${elapsedPercent}%`,
            width: 12,
            height: 12,
            borderRadius: '50%',
            marginLeft: -6,
            background: overdue ? 'var(--eco-danger)' : 'var(--eco-primary)',
            border: '2px solid var(--eco-card)',
          }}
        />
      </div>

      <div
        className="eco-text-muted"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '0.72rem',
          marginTop: '0.5rem',
        }}
      >
        <span>Started {formatDate(createdAt, 'dd MMM')}</span>
        <span style={{ color: overdue ? 'var(--eco-danger)' : undefined }}>
          {overdue
            ? `${Math.abs(daysRemaining)} days overdue`
            : `${daysRemaining} days left`}
        </span>
        <span>{formatDate(targetDate, 'dd MMM yyyy')}</span>
      </div>
    </div>
  );
}

export default function Goals() {
  const { prefersReducedMotion } = useTheme();

  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busyGoalId, setBusyGoalId] = useState(null);

  // Last month's totals per category, used to suggest a realistic baseline
  const [previousMonthTotals, setPreviousMonthTotals] = useState({});

  const [form, setForm] = useState({
    category: 'transport',
    baselineEmission: '',
    targetReductionPercent: '20',
    targetDate: '',
  });
  const [touched, setTouched] = useState({});

  // ---------------------------------------------------------------------
  const loadGoals = async () => {
    try {
      const data = await goalsApi.getAll();
      setGoals(data.goals || []);
      setError(null);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Could not load your goals.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGoals();

    // Pull last month's category totals so the baseline field can be
    // pre-filled with a number the user has actually produced, rather than
    // asking them to invent one
    dashboardApi
      .getCategoryChart()
      .then((data) => {
        const totals = {};
        (data.keys || []).forEach((key, index) => {
          totals[key] = data.previousData?.[index] || 0;
        });
        setPreviousMonthTotals(totals);
      })
      .catch(() => {
        // Only a convenience - the form works fine without it
      });
  }, []);

  // Suggest last month's total for the chosen category
  const suggestedBaseline = previousMonthTotals[form.category] || 0;

  // Categories that already have an active goal cannot have a second one -
  // the backend rejects it, so the form should not offer it either
  const categoriesWithActiveGoal = useMemo(
    () =>
      goals.filter((goal) => goal.status === 'active').map((goal) => goal.category),
    [goals]
  );

  const availableCategories = CATEGORY_ORDER.filter(
    (category) => !categoriesWithActiveGoal.includes(category)
  );

  // --- validation ---
  const baselineNumber = parseFloat(form.baselineEmission);
  const errors = {
    baselineEmission:
      form.baselineEmission === ''
        ? 'Enter your current monthly emissions for this category.'
        : !Number.isFinite(baselineNumber) || baselineNumber <= 0
          ? 'Baseline must be greater than zero.'
          : null,
    targetDate: !form.targetDate
      ? 'Choose a deadline.'
      : new Date(form.targetDate) <= new Date(new Date().toDateString())
        ? 'The deadline must be in the future.'
        : null,
    category: availableCategories.includes(form.category)
      ? null
      : 'You already have an active goal for this category.',
  };
  const isValid = !errors.baselineEmission && !errors.targetDate && !errors.category;

  // Keep the category field on something selectable as goals are added
  useEffect(() => {
    if (availableCategories.length > 0 && !availableCategories.includes(form.category)) {
      setForm((previous) => ({ ...previous, category: availableCategories[0] }));
    }
  }, [availableCategories, form.category]);

  const handleCreate = async (event) => {
    event.preventDefault();

    setTouched({ baselineEmission: true, targetDate: true, category: true });
    if (!isValid || submitting) return;

    setSubmitting(true);
    try {
      await goalsApi.create({
        category: form.category,
        baselineEmission: baselineNumber,
        targetReductionPercent: parseFloat(form.targetReductionPercent),
        targetDate: form.targetDate,
      });

      toast.success('Goal created.');
      setShowForm(false);
      setForm((previous) => ({ ...previous, baselineEmission: '', targetDate: '' }));
      setTouched({});
      loadGoals();
    } catch (requestError) {
      toast.error(getErrorMessage(requestError, 'Could not create that goal.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkAchieved = async (goal) => {
    setBusyGoalId(goal.id);
    try {
      await goalsApi.updateStatus(goal.id, 'achieved');

      if (!prefersReducedMotion) celebrate();
      toast.success(`${formatCategory(goal.category)} goal achieved!`);

      loadGoals();
    } catch (requestError) {
      toast.error(getErrorMessage(requestError, 'Could not update that goal.'));
    } finally {
      setBusyGoalId(null);
    }
  };

  const handleDelete = async (goal) => {
    setBusyGoalId(goal.id);
    try {
      await goalsApi.remove(goal.id);
      toast.success('Goal deleted.');
      setGoals((current) => current.filter((item) => item.id !== goal.id));
    } catch (requestError) {
      toast.error(getErrorMessage(requestError, 'Could not delete that goal.'));
    } finally {
      setBusyGoalId(null);
    }
  };

  const activeGoals = goals.filter((goal) => goal.status === 'active');
  const finishedGoals = goals.filter((goal) => goal.status !== 'active');

  // ---------------------------------------------------------------------
  if (loading) {
    return (
      <div className="container" style={{ paddingTop: '2.5rem', paddingBottom: '3rem' }}>
        <div
          className="eco-skeleton"
          style={{ width: 220, height: 34, borderRadius: 8, marginBottom: '2rem' }}
        />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '1.5rem',
          }}
        >
          <SkeletonCard lines={4} height={280} />
          <SkeletonCard lines={4} height={280} />
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingTop: '2.5rem', paddingBottom: '3.5rem' }}>
      {/* ============ HEADER ============ */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '2rem',
        }}
      >
        <div>
          <h1 style={{ fontSize: 'clamp(1.7rem, 4vw, 2.4rem)', marginBottom: '0.3rem' }}>
            Your <span className="eco-gradient-text">Goals</span>
          </h1>
          <p className="eco-text-muted" style={{ margin: 0, fontSize: '0.92rem' }}>
            One target per category, measured against this month&rsquo;s emissions.
          </p>
        </div>

        <button
          type="button"
          className="eco-btn eco-btn-primary"
          onClick={() => setShowForm((open) => !open)}
          disabled={availableCategories.length === 0 && !showForm}
        >
          {showForm ? <X size={17} /> : <Plus size={17} />}
          {showForm ? 'Cancel' : 'New goal'}
        </button>
      </div>

      {error && (
        <div className="eco-card" style={{ marginBottom: '1.5rem', borderColor: 'var(--eco-danger)' }}>
          <div style={{ display: 'flex', gap: '0.7rem', alignItems: 'center' }}>
            <AlertCircle size={19} style={{ color: 'var(--eco-danger)' }} />
            <span style={{ fontSize: '0.9rem' }}>{error}</span>
          </div>
        </div>
      )}

      {/* ============ CREATE FORM ============ */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={prefersReducedMotion ? {} : { opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden', marginBottom: '1.5rem' }}
          >
            <div className="eco-card eco-card-accent">
              <h2 style={{ fontSize: '1.05rem', marginBottom: '1.3rem' }}>Set a new target</h2>

              {availableCategories.length === 0 ? (
                <p className="eco-text-muted" style={{ margin: 0, fontSize: '0.9rem' }}>
                  Every category already has an active goal. Complete or delete one to
                  set another.
                </p>
              ) : (
                <form className="eco-form" onSubmit={handleCreate} noValidate>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: '1rem',
                    }}
                  >
                    <SelectField
                      id="goal-category"
                      label="Category"
                      value={form.category}
                      onChange={(category) => setForm((prev) => ({ ...prev, category }))}
                      options={availableCategories.map((category) => ({
                        value: category,
                        label: CATEGORY_META[category].label,
                        hint: previousMonthTotals[category]
                          ? `${formatEmission(previousMonthTotals[category])} last month`
                          : 'No data last month',
                      }))}
                    />

                    <SelectField
                      id="goal-reduction"
                      label="Reduce by"
                      value={form.targetReductionPercent}
                      onChange={(percent) =>
                        setForm((prev) => ({ ...prev, targetReductionPercent: percent }))
                      }
                      options={REDUCTION_OPTIONS.map((percent) => ({
                        value: String(percent),
                        label: `${percent}%`,
                        hint:
                          baselineNumber > 0
                            ? `Target: ${formatEmission(
                                baselineNumber * (1 - percent / 100)
                              )} per month`
                            : undefined,
                      }))}
                    />

                    <div>
                      <div className="form-floating">
                        <input
                          type="number"
                          id="goal-baseline"
                          className={`form-control ${
                            touched.baselineEmission && errors.baselineEmission ? 'is-invalid' : ''
                          }`}
                          placeholder="0"
                          value={form.baselineEmission}
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, baselineEmission: event.target.value }))
                          }
                          onBlur={() => setTouched((prev) => ({ ...prev, baselineEmission: true }))}
                          min="0"
                          step="any"
                        />
                        <label htmlFor="goal-baseline">Current monthly (kg CO₂)</label>
                      </div>

                      {suggestedBaseline > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              baselineEmission: String(suggestedBaseline),
                            }))
                          }
                          className="eco-field-hint"
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            color: 'var(--eco-primary)',
                            fontWeight: 500,
                          }}
                        >
                          Use last month: {formatEmission(suggestedBaseline)}
                        </button>
                      )}

                      {touched.baselineEmission && errors.baselineEmission && (
                        <div className="eco-field-error">
                          <AlertCircle size={13} />
                          {errors.baselineEmission}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="form-floating">
                        <input
                          type="date"
                          id="goal-date"
                          className={`form-control ${
                            touched.targetDate && errors.targetDate ? 'is-invalid' : ''
                          }`}
                          value={form.targetDate}
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, targetDate: event.target.value }))
                          }
                          onBlur={() => setTouched((prev) => ({ ...prev, targetDate: true }))}
                          // Cannot pick today or earlier
                          min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
                        />
                        <label htmlFor="goal-date">Deadline</label>
                      </div>
                      {touched.targetDate && errors.targetDate && (
                        <div className="eco-field-error">
                          <AlertCircle size={13} />
                          {errors.targetDate}
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="eco-btn eco-btn-primary"
                    style={{ marginTop: '1.3rem' }}
                    disabled={submitting || !isValid}
                  >
                    {submitting ? (
                      <>
                        <Loader2 size={17} style={{ animation: 'eco-spin 0.8s linear infinite' }} />
                        Creating…
                      </>
                    ) : (
                      <>
                        <Flag size={17} />
                        Create goal
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ============ EMPTY STATE ============ */}
      {goals.length === 0 && !showForm && (
        <div className="eco-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <Target size={44} style={{ color: 'var(--eco-primary)', opacity: 0.6 }} />
          <h2 style={{ fontSize: '1.3rem', marginTop: '1.1rem', marginBottom: '0.6rem' }}>
            No goals yet
          </h2>
          <p className="eco-text-muted" style={{ maxWidth: 460, margin: '0 auto 1.6rem' }}>
            Pick the category you emit most in and commit to cutting it. A target on
            one behaviour beats a vague intention to do better.
          </p>
          <button type="button" className="eco-btn eco-btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={17} />
            Set your first goal
          </button>
        </div>
      )}

      {/* ============ ACTIVE GOALS ============ */}
      {activeGoals.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '1.5rem',
            marginBottom: finishedGoals.length > 0 ? '2.5rem' : 0,
          }}
        >
          {activeGoals.map((goal, index) => {
            const categoryMeta = CATEGORY_META[goal.category] || {};
            const busy = busyGoalId === goal.id;

            return (
              <motion.div
                key={goal.id}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: index * 0.07 }}
                className="eco-card"
              >
                {/* --- header --- */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.7rem',
                    marginBottom: '1.2rem',
                  }}
                >
                  <div>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '0.15rem' }}>
                      {formatCategory(goal.category)}
                    </h3>
                    <p className="eco-text-muted" style={{ margin: 0, fontSize: '0.82rem' }}>
                      Cut {goal.targetReductionPercent}% from{' '}
                      {formatEmission(goal.baselineEmission)}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDelete(goal)}
                    disabled={busy}
                    aria-label="Delete goal"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--eco-text-muted)',
                      cursor: 'pointer',
                      padding: 6,
                      display: 'flex',
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                {/* --- ring + numbers --- */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1.3rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <GoalRing
                    percent={goal.progressPercent}
                    size={132}
                    strokeWidth={10}
                    label={`${Math.round(goal.progressPercent)}%`}
                    sublabel="of the way"
                    delay={0.2 + index * 0.05}
                  />

                  <div style={{ flex: 1, minWidth: 130 }}>
                    <div style={{ marginBottom: '0.7rem' }}>
                      <div className="eco-text-muted" style={{ fontSize: '0.75rem' }}>
                        This month
                      </div>
                      <div
                        style={{
                          fontFamily: 'Space Grotesk, sans-serif',
                          fontWeight: 700,
                          fontSize: '1.15rem',
                          color: categoryMeta.color,
                        }}
                      >
                        {formatEmission(goal.currentEmission)}
                      </div>
                    </div>

                    <div>
                      <div className="eco-text-muted" style={{ fontSize: '0.75rem' }}>
                        Target
                      </div>
                      <div style={{ fontWeight: 600, fontSize: '1.02rem' }}>
                        {formatEmission(goal.targetEmission)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* --- how far short, or how far ahead --- */}
                <div
                  style={{
                    marginTop: '1.1rem',
                    padding: '0.7rem 0.9rem',
                    borderRadius: 'var(--eco-radius-sm)',
                    background: goal.isAchieved
                      ? 'rgba(var(--eco-primary-rgb), 0.08)'
                      : 'rgba(245, 158, 11, 0.07)',
                    fontSize: '0.84rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  {goal.isAchieved ? (
                    <>
                      <Check size={15} style={{ color: 'var(--eco-primary)' }} />
                      <span>You are under target — ready to close this goal.</span>
                    </>
                  ) : (
                    <>
                      <TrendingDown size={15} style={{ color: 'var(--eco-orange)' }} />
                      <span>
                        {formatNumber(goal.currentEmission - goal.targetEmission, 1)} kg still
                        to cut this month.
                      </span>
                    </>
                  )}
                </div>

                <GoalTimeline
                  createdAt={goal.createdAt}
                  targetDate={goal.targetDate}
                  daysRemaining={goal.daysRemaining}
                />

                {/* --- actions --- */}
                {goal.isAchieved && (
                  <button
                    type="button"
                    className="eco-btn eco-btn-primary"
                    style={{ width: '100%', marginTop: '1.1rem' }}
                    onClick={() => handleMarkAchieved(goal)}
                    disabled={busy}
                  >
                    {busy ? (
                      <Loader2 size={16} style={{ animation: 'eco-spin 0.8s linear infinite' }} />
                    ) : (
                      <Check size={16} />
                    )}
                    Mark as achieved
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ============ FINISHED GOALS ============ */}
      {finishedGoals.length > 0 && (
        <div>
          <h2 style={{ fontSize: '1.15rem', marginBottom: '1.1rem' }}>Completed</h2>

          <div style={{ display: 'grid', gap: '0.8rem' }}>
            {finishedGoals.map((goal) => (
              <div
                key={goal.id}
                className="eco-card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  flexWrap: 'wrap',
                  padding: '1rem 1.2rem',
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    background:
                      goal.status === 'achieved'
                        ? 'rgba(var(--eco-primary-rgb), 0.14)'
                        : 'rgba(239, 68, 68, 0.12)',
                    color:
                      goal.status === 'achieved' ? 'var(--eco-primary)' : 'var(--eco-danger)',
                  }}
                >
                  {goal.status === 'achieved' ? <Check size={19} /> : <X size={19} />}
                </div>

                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 600 }}>{formatCategory(goal.category)}</div>
                  <div className="eco-text-muted" style={{ fontSize: '0.82rem' }}>
                    {goal.targetReductionPercent}% reduction ·{' '}
                    {goal.status === 'achieved' ? 'Achieved' : 'Missed'} ·{' '}
                    <CalendarClock size={11} style={{ verticalAlign: -1 }} />{' '}
                    {formatDate(goal.targetDate)}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleDelete(goal)}
                  disabled={busyGoalId === goal.id}
                  aria-label="Delete goal"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--eco-text-muted)',
                    cursor: 'pointer',
                    padding: 6,
                    display: 'flex',
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
