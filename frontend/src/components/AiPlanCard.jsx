// EcoTrack/frontend/src/components/AiPlanCard.jsx
// An AI-suggested reduction goal - see backend/routes/assistant.py's
// POST /api/assistant/plan. Every number shown here (baseline, target
// percent, target emission, deadline) is computed server-side from real
// logged data; Gemini only picks which category to focus on and writes the
// one-line rationale. "Add this goal" below is a real goalsApi.create()
// call with those exact server-computed numbers - there is no separate "AI
// goal" system, just a different way of arriving at the same POST
// /api/goals payload every other goal on this page goes through.
//
// Hidden entirely (like the AI summary button on Reports.jsx) when the
// server has no GEMINI_API_KEY configured, via the same assistantApi.
// getStatus() gate.

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Check, Loader2, Sparkles } from 'lucide-react';

import { assistantApi, getErrorMessage, goalsApi } from '../utils/api';
import { useTheme } from '../context/ThemeContext';
import { CATEGORY_META } from '../utils/emissionHelpers';
import { formatCategory, formatDate, formatEmission } from '../utils/formatters';

export default function AiPlanCard({ onAccepted }) {
  const { prefersReducedMotion } = useTheme();
  const [available, setAvailable] = useState(false);
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    assistantApi
      .getStatus()
      .then((data) => {
        if (!cancelled) setAvailable(Boolean(data.available));
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleGetPlan = async () => {
    setLoading(true);
    try {
      const data = await assistantApi.getPlan();
      if (!data.available) {
        toast(data.reason || 'Nothing to suggest yet - keep logging.');
        setDismissed(true);
        return;
      }
      setPlan(data);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not get a suggestion right now.'));
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!plan) return;
    setAccepting(true);
    try {
      await goalsApi.create({
        category: plan.category,
        baselineEmission: plan.baselineEmission,
        targetReductionPercent: plan.targetReductionPercent,
        targetDate: plan.targetDate,
      });
      toast.success('Goal added.');
      setPlan(null);
      setDismissed(true);
      onAccepted?.();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not create that goal.'));
    } finally {
      setAccepting(false);
    }
  };

  if (!available || dismissed) return null;

  const meta = plan ? CATEGORY_META[plan.category] : null;

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="eco-card"
      style={{
        marginBottom: '2rem',
        border: '1px solid color-mix(in srgb, var(--eco-primary) 24%, var(--eco-border))',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.9rem' }}>
        <Sparkles size={20} style={{ color: 'var(--eco-primary)', flexShrink: 0, marginTop: 2 }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          {!plan ? (
            <>
              <span className="eco-marker" style={{ display: 'block', marginBottom: '0.4rem' }}>
                Not sure where to start?
              </span>
              <p className="eco-text-muted" style={{ fontSize: '0.85rem', margin: '0 0 0.8rem' }}>
                Let the assistant look at your real activity and suggest one goal worth setting.
              </p>
              <button
                type="button"
                onClick={handleGetPlan}
                disabled={loading}
                className="eco-btn eco-btn-outline"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
              >
                {loading ? (
                  <Loader2 size={15} style={{ animation: 'eco-spin 0.8s linear infinite' }} />
                ) : (
                  <Sparkles size={15} />
                )}
                {loading ? 'Thinking…' : 'Suggest a goal'}
              </button>
            </>
          ) : (
            <>
              <span className="eco-marker" style={{ display: 'block', marginBottom: '0.4rem' }}>
                Suggested goal
              </span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span className="eco-readout" style={{ fontSize: '1.15rem', fontWeight: 600, color: meta?.color }}>
                  {meta?.label || formatCategory(plan.category)}
                </span>
                <span className="eco-text-muted" style={{ fontSize: '0.82rem' }}>
                  cut {plan.targetReductionPercent}% by {formatDate(plan.targetDate)}
                </span>
              </div>
              <p style={{ fontSize: '0.86rem', margin: '0.5rem 0 0.4rem', lineHeight: 1.5 }}>
                {plan.rationale}
              </p>
              <p className="eco-text-muted" style={{ fontSize: '0.78rem', margin: '0 0 1rem' }}>
                {formatEmission(plan.baselineEmission)} this month → target {formatEmission(plan.targetEmission)}
              </p>
              <div style={{ display: 'flex', gap: '0.6rem' }}>
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={accepting}
                  className="eco-btn eco-btn-primary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  {accepting ? (
                    <Loader2 size={15} style={{ animation: 'eco-spin 0.8s linear infinite' }} />
                  ) : (
                    <Check size={15} />
                  )}
                  Add this goal
                </button>
                <button
                  type="button"
                  onClick={() => setDismissed(true)}
                  className="eco-btn eco-btn-ghost"
                >
                  Not now
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
