// EcoTrack/frontend/src/components/QuickLogChips.jsx
// One-tap re-logging for the things a user does often, plus habit-mined
// suggestions for patterns they have not turned into a template yet. This is
// the direct answer to the biggest real gap in the app before this feature
// existed: every entry required a full trip through the Calculator's form,
// which is a lot of friction for "I drove to work again."
//
// A tapped chip calls POST /api/templates/<id>/log, which runs through the
// exact same validation and formula as the Calculator - see
// backend/routes/carbon.py:save_calculated_record.

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Check, Sparkles, X, Zap } from 'lucide-react';

import { templatesApi, getErrorMessage } from '../utils/api';
import { useTheme } from '../context/ThemeContext';
import { useIntervention } from '../hooks/useIntervention';
import { CATEGORY_ICONS } from '../utils/categoryIcons';
import { CATEGORY_META } from '../utils/emissionHelpers';
import { formatEmission, formatSubType } from '../utils/formatters';

function SuggestionCard({ suggestion, onResolved }) {
  const [creating, setCreating] = useState(false);
  // Belt-and-braces against a double click or a slow parent re-render:
  // this card removes ITSELF from view the instant a decision is made,
  // rather than only trusting the parent's array update to eventually
  // stop rendering it. Caught live: a stuck suggestion let repeated clicks
  // create duplicate templates before this existed.
  const [resolvedLocally, setResolvedLocally] = useState(false);
  const { accept, dismiss } = useIntervention({
    type: 'quick_log_suggestion',
    variant: 'mined_template',
    payloadSummary: { category: suggestion.category, subType: suggestion.subType },
  });

  const meta = CATEGORY_META[suggestion.category];

  const handleAccept = async () => {
    if (creating || resolvedLocally) return; // guards a double-click too, not just a slow parent update
    setCreating(true);
    try {
      await templatesApi.create({
        label: `${formatSubType(suggestion.subType)}`,
        category: suggestion.category,
        subType: suggestion.subType,
        quantity: suggestion.suggestedQuantity,
        unit: suggestion.unit,
        weekdays: suggestion.weekdays,
        source: 'mined',
      });
      accept();
      toast.success('Added as a quick-log chip.');
      setResolvedLocally(true);
      onResolved();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not save that template.'));
    } finally {
      setCreating(false);
    }
  };

  const handleDismiss = () => {
    dismiss();
    setResolvedLocally(true);
    onResolved();
  };

  if (resolvedLocally) return null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        padding: '0.55rem 0.8rem',
        borderRadius: 'var(--eco-radius-sm)',
        border: '1px dashed var(--rule-strong)',
      }}
    >
      <Sparkles size={15} style={{ color: meta?.color || 'var(--eco-primary)', flexShrink: 0 }} />
      <span style={{ fontSize: '0.82rem', flex: 1 }}>
        You log <strong>{formatSubType(suggestion.subType)}</strong> often (~{suggestion.suggestedQuantity}{' '}
        {suggestion.unit}, {suggestion.occurrences}× recently) — save it as a quick-log chip?
      </span>
      <button
        type="button"
        className="eco-btn eco-btn-outline"
        style={{ padding: '0.3rem 0.5rem' }}
        onClick={handleAccept}
        disabled={creating}
        aria-label="Save as template"
      >
        <Check size={13} />
      </button>
      <button
        type="button"
        className="eco-btn eco-btn-ghost"
        style={{ padding: '0.3rem 0.5rem' }}
        onClick={handleDismiss}
        aria-label="Dismiss"
      >
        <X size={13} />
      </button>
    </motion.div>
  );
}

export default function QuickLogChips({ onLogged }) {
  const { prefersReducedMotion } = useTheme();
  const [templates, setTemplates] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [loggingId, setLoggingId] = useState(null);
  const [justLoggedId, setJustLoggedId] = useState(null);

  const loadTemplates = () => {
    templatesApi
      .getAll()
      .then((data) => setTemplates(data.templates || []))
      .catch(() => setTemplates([]));
  };

  useEffect(() => {
    loadTemplates();
    templatesApi
      .getSuggestions()
      .then((data) => setSuggestions(data.suggestions || []))
      .catch(() => setSuggestions([]));
  }, []);

  const handleTap = async (template) => {
    setLoggingId(template.id);
    try {
      const data = await templatesApi.logOne(template.id);
      toast.success(`Logged ${formatEmission(data.emissionKgco2)} from '${template.label}'`);
      setJustLoggedId(template.id);
      setTimeout(() => setJustLoggedId(null), 1400);
      loadTemplates();
      onLogged?.();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not log that.'));
    } finally {
      setLoggingId(null);
    }
  };

  const resolveSuggestion = (suggestion) => {
    // Keyed by category+subType rather than object identity - the same key
    // already used for React's own `key` prop below, and not dependent on
    // `suggestion` staying the exact same reference across whatever render
    // happened between this card mounting and its own async accept() resolving.
    const key = `${suggestion.category}_${suggestion.subType}`;
    setSuggestions((current) => current.filter((s) => `${s.category}_${s.subType}` !== key));
    loadTemplates();
  };

  if (templates === null) return null;
  if (templates.length === 0 && suggestions.length === 0) return null;

  return (
    <div style={{ marginBottom: '1.8rem' }}>
      {templates.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginBottom: suggestions.length ? '0.8rem' : 0 }}>
          {templates.map((template) => {
            const meta = CATEGORY_META[template.category];
            const Icon = CATEGORY_ICONS[template.category] || Zap;
            const isLogging = loggingId === template.id;
            const isDone = justLoggedId === template.id;

            return (
              <motion.button
                key={template.id}
                type="button"
                layout
                onClick={() => handleTap(template)}
                disabled={isLogging}
                whileTap={prefersReducedMotion ? {} : { scale: 0.94 }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 0.85rem',
                  borderRadius: 999,
                  border: '1px solid var(--eco-border)',
                  background: 'transparent',
                  color: isDone ? 'var(--eco-primary)' : 'var(--eco-text)',
                  fontSize: '0.82rem',
                  cursor: isLogging ? 'wait' : 'pointer',
                }}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {isDone ? (
                    <motion.span key="check" initial={{ scale: 0 }} animate={{ scale: 1 }} style={{ display: 'flex' }}>
                      <Check size={14} />
                    </motion.span>
                  ) : (
                    <motion.span key="icon" initial={{ scale: 0 }} animate={{ scale: 1 }} style={{ display: 'flex', color: meta?.color }}>
                      <Icon size={14} />
                    </motion.span>
                  )}
                </AnimatePresence>
                {template.label}
              </motion.button>
            );
          })}
        </div>
      )}

      {/* Plain list rendering, not AnimatePresence - genuinely broken here
          (the same class of bug fixed across BillScanner.jsx,
          GrowingTree.jsx, SelectField.jsx and others): dismissing a
          suggestion risked leaving a stale, faded-but-still-rendered chip
          behind instead of it actually leaving the list. */}
      {suggestions.map((suggestion) => (
        <SuggestionCard
          key={`${suggestion.category}_${suggestion.subType}`}
          suggestion={suggestion}
          onResolved={() => resolveSuggestion(suggestion)}
        />
      ))}
    </div>
  );
}
