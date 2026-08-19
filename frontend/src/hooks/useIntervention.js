// EcoTrack/frontend/src/hooks/useIntervention.js
// The one hook every recommendation-shaped component wires into, so the
// `interventions` collection - the evaluation harness the paper's adoption-
// rate numbers come from - can never be quietly forgotten by a future page
// that shows a suggestion.
//
// TWO WAYS AN INTERVENTION GETS ITS ID
//   1. Server-generated (a forecast, a ranked swap list, a cohort
//      comparison): the backend already wrote the `interventions` document
//      the moment it computed the recommendation (see
//      backend/routes/insights.py's _log_intervention) and handed the id
//      back in the response. Pass that id in as `existingId` and this hook
//      does no logging of its own - just wraps accept()/dismiss() around it.
//   2. Client-rendered (a quick-log chip, a streak nudge): nothing on the
//      server already knows this was shown, so this hook logs it itself on
//      mount via POST /api/engagement/interventions.
//
// Logging is always fire-and-forget: a failed log must never block or break
// the UI the user is actually looking at. See backend/routes/engagement.py.
//
// Usage:
//   const { accept, dismiss } = useIntervention({ existingId: forecast.interventionId });
//   const { accept, dismiss } = useIntervention({
//     type: 'quick_log_suggestion', variant: 'template_chip',
//     payloadSummary: { templateId }, projectedSavingKg: null,
//   });

import { useCallback, useEffect, useState } from 'react';

import { engagementApi } from '../utils/api';

export function useIntervention({
  existingId = null,
  type = null,
  variant = null,
  payloadSummary = null,
  projectedSavingKg = null,
  skip = false,
} = {}) {
  const [interventionId, setInterventionId] = useState(existingId);

  useEffect(() => {
    if (existingId) {
      setInterventionId(existingId);
      return undefined;
    }
    if (skip || !type) return undefined;

    let cancelled = false;
    engagementApi
      .logIntervention({ type, variant, payloadSummary, projectedSavingKg })
      .then((result) => {
        if (!cancelled) setInterventionId(result.id);
      })
      .catch(() => {
        // Fire-and-forget: a component that cannot log its own impression
        // still has to render normally for the person looking at it
      });

    return () => {
      cancelled = true;
    };
    // Only re-log if the recommendation identity itself changes - not on
    // every payloadSummary object identity change, which would re-fire this
    // on every parent re-render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingId, type, variant, skip]);

  const accept = useCallback(
    (observedDeltaKg) => {
      if (!interventionId) return;
      const body = { action: 'accepted' };
      if (observedDeltaKg !== undefined && observedDeltaKg !== null) {
        body.observedDeltaKg = observedDeltaKg;
      }
      engagementApi.updateIntervention(interventionId, body).catch(() => {});
    },
    [interventionId]
  );

  const dismiss = useCallback(() => {
    if (!interventionId) return;
    engagementApi.updateIntervention(interventionId, { action: 'dismissed' }).catch(() => {});
  }, [interventionId]);

  return { interventionId, accept, dismiss };
}

export default useIntervention;
