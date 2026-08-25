// EcoTrack/frontend/src/components/QuizModule.jsx
// A short, two-question quiz attached to one Learn.jsx article - see
// utils/data/learnModules.js for why every question is derived from the
// article's own already-cited figures, never a new claim.
//
// Signed-out visitors can still read every article (Learn.jsx never gates
// that); this component only asks for sign-in when someone tries to
// actually take the quiz, since completion has to be tied to a real
// account for the certificate to mean anything.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Check, RotateCcw, X } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { learnApi, getErrorMessage } from '../utils/api';
import { LEARN_MODULES } from '../data/learnModules';

export default function QuizModule({ moduleKey, accent, completed, onCompleted }) {
  const { user } = useAuth();
  const module = LEARN_MODULES.find((m) => m.key === moduleKey);
  const [answers, setAnswers] = useState({});
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!module) return null;

  const allAnswered = module.questions.every((_, index) => answers[index] !== undefined);
  const allCorrect = module.questions.every((question, index) => answers[index] === question.correctIndex);

  const handleCheck = async () => {
    if (!allAnswered) return;
    setChecked(true);
    if (!allCorrect) return;

    setSubmitting(true);
    try {
      const data = await learnApi.completeModule(moduleKey);
      onCompleted?.(data);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not save your progress.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetry = () => {
    setAnswers({});
    setChecked(false);
  };

  if (!user) {
    return (
      <div style={{ paddingTop: '1.2rem', borderTop: '1px solid var(--rule)' }}>
        <p className="eco-text-muted" style={{ fontSize: '0.84rem', margin: 0 }}>
          <Link to="/login" style={{ color: accent }}>Sign in</Link> to take this module's quiz and
          work toward a climate literacy certificate.
        </p>
      </div>
    );
  }

  if (completed) {
    return (
      <div
        style={{
          paddingTop: '1.2rem',
          borderTop: '1px solid var(--rule)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.86rem',
          color: accent,
        }}
      >
        <Check size={16} /> Module complete
      </div>
    );
  }

  return (
    <div style={{ paddingTop: '1.2rem', borderTop: '1px solid var(--rule)' }}>
      <span className="eco-marker" style={{ display: 'block', marginBottom: '0.9rem', fontSize: '0.68rem' }}>
        Quick check
      </span>

      {module.questions.map((question, qIndex) => {
        const selected = answers[qIndex];
        const isCorrect = checked && selected === question.correctIndex;
        const isWrong = checked && selected !== undefined && selected !== question.correctIndex;

        return (
          <div key={qIndex} style={{ marginBottom: qIndex === module.questions.length - 1 ? '1rem' : '1.3rem' }}>
            <p style={{ fontSize: '0.86rem', margin: '0 0 0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {question.prompt}
              {isCorrect && <Check size={14} style={{ color: 'var(--eco-primary)', flexShrink: 0 }} />}
              {isWrong && <X size={14} style={{ color: 'var(--eco-danger)', flexShrink: 0 }} />}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {question.options.map((option, oIndex) => {
                const isSelected = selected === oIndex;
                const showAsCorrect = checked && oIndex === question.correctIndex;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => !checked && setAnswers((prev) => ({ ...prev, [qIndex]: oIndex }))}
                    disabled={checked}
                    className={`eco-btn ${isSelected ? 'eco-btn-primary' : 'eco-btn-outline'}`}
                    style={{
                      padding: '0.35rem 0.8rem',
                      fontSize: '0.78rem',
                      borderColor: showAsCorrect && !isSelected ? 'var(--eco-primary)' : undefined,
                    }}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {!checked || !allCorrect ? (
        <button
          type="button"
          onClick={checked ? handleRetry : handleCheck}
          disabled={!checked && (!allAnswered || submitting)}
          className="eco-btn eco-btn-outline"
          style={{ fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
        >
          {checked ? (
            <>
              <RotateCcw size={13} /> Try again
            </>
          ) : (
            'Check answers'
          )}
        </button>
      ) : null}
    </div>
  );
}
