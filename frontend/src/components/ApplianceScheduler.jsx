// EcoTrack/frontend/src/components/ApplianceScheduler.jsx
// "Run this at 11pm instead of 7pm, save X kg" - the actionable half of
// GridIntensityCard's own time-of-day model, for one chosen appliance at a
// time. See backend/grid_engine.py's best_time_to_run and APPLIANCE_CATALOG.
//
// Self-contained: fetches its own catalog and, per selection, its own
// schedule - GridIntensityCard's sibling section already owns the "current
// grid state" fetch, this owns the appliance-specific one instead of
// threading a third prop through Insights.jsx for something that only
// changes when the dropdown does.

import { useEffect, useState } from 'react';
import { ArrowRight, Loader2, Zap } from 'lucide-react';

import { insightsApi, getErrorMessage } from '../utils/api';
import { formatEmission } from '../utils/formatters';

export default function ApplianceScheduler() {
  const [appliances, setAppliances] = useState(null);
  const [selected, setSelected] = useState('');
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    insightsApi
      .getAppliances()
      .then((data) => {
        setAppliances(data.appliances);
        if (data.appliances.length) setSelected(data.appliances[0].key);
      })
      .catch(() => {}); // the section around this simply has nothing to show
  }, []);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    insightsApi
      .getApplianceSchedule(selected)
      .then((data) => { if (!cancelled) setSchedule(data); })
      .catch((err) => { if (!cancelled) setError(getErrorMessage(err, 'Could not load this appliance.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selected]);

  if (!appliances || appliances.length === 0) return null;

  return (
    <div style={{ marginTop: '1.4rem', paddingTop: '1.2rem', borderTop: '1px solid var(--rule)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.9rem' }}>
        <Zap size={15} style={{ color: 'var(--eco-text-muted)' }} />
        <span className="eco-marker" style={{ fontSize: '0.7rem' }}>Pick an appliance</span>
      </div>

      <select
        className="form-select"
        style={{ maxWidth: 320, marginBottom: '1rem' }}
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
      >
        {appliances.map((item) => (
          <option key={item.key} value={item.key}>{item.label}</option>
        ))}
      </select>

      {loading && (
        <p className="eco-text-muted" style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Loader2 size={14} style={{ animation: 'eco-spin 0.8s linear infinite' }} />
          Checking…
        </p>
      )}

      {error && <p className="eco-text-muted" style={{ fontSize: '0.85rem' }}>{error}</p>}

      {!loading && !error && schedule && (
        <div>
          {schedule.isAlreadyCleanest ? (
            <p style={{ fontSize: '0.88rem', margin: 0 }}>
              Right now (<strong>{schedule.currentPartLabel}</strong>) is already the cleanest
              window for the {schedule.applianceLabel.toLowerCase()} - about{' '}
              <strong>{formatEmission(schedule.kgIfRunNow)}</strong>.
            </p>
          ) : (
            <p style={{ fontSize: '0.88rem', margin: '0 0 0.8rem' }}>
              Running the {schedule.applianceLabel.toLowerCase()} now ({schedule.currentPartLabel}) costs about{' '}
              <strong>{formatEmission(schedule.kgIfRunNow)}</strong>. Shifting it to{' '}
              <strong>{schedule.cleanestPartLabel}</strong> would cost about{' '}
              <strong>{formatEmission(schedule.kgIfRunCleanest)}</strong> instead -{' '}
              <strong style={{ color: 'var(--eco-primary)' }}>
                {formatEmission(schedule.savingKg)} saved
              </strong>{' '}
              for the exact same load.
            </p>
          )}

          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            {schedule.schedule.map((part) => (
              <div
                key={part.key}
                style={{
                  padding: '0.5rem 0.8rem',
                  borderRadius: 'var(--eco-radius-sm)',
                  border: `1px solid ${part.key === schedule.cleanestPart ? 'var(--eco-primary)' : 'var(--rule)'}`,
                  fontSize: '0.78rem',
                }}
              >
                <div className="eco-text-muted" style={{ fontSize: '0.68rem' }}>{part.label}</div>
                <span className="eco-readout">{part.kg} kg</span>
                {part.key === schedule.currentPart && (
                  <ArrowRight size={11} style={{ marginLeft: 4, verticalAlign: -1, color: 'var(--eco-text-muted)' }} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
