// EcoTrack/frontend/src/components/TripMeter.jsx
// "Measure this trip" - two GPS fixes (start, end), a straight-line
// distance between them, and nothing else. Deliberately NOT continuous
// background tracking: this app already applies "confirm before anything
// is saved" everywhere (bill scanner, voice logging, the AI plan - see
// reminders.py's own module docstring for the same rule stated backend-
// side), and continuous location tracking is a different, much larger
// commitment - a battery cost the whole time the app is open, a
// background-location permission most browsers/OSes gate hard behind
// their own warnings, and a privacy posture ("this app is watching where
// you go") this project has not asked for or earned. A two-tap measurement
// is the same value (no manual odometer guessing) without any of that:
// - Nothing here is sent to the backend or stored anywhere. Both fixes
//   and the distance live in this component's own state and are gone the
//   moment the page is left.
// - Nothing happens without the browser's own native permission prompt,
//   which the user can deny with zero effect on the rest of the app.
// - The result only ever PRE-FILLS the quantity field - the same "propose,
//   never auto-save" rule this app already applies everywhere else. The
//   user reviews and can edit the number before it is ever logged.

import { useState } from 'react';
import { Loader2, MapPin, Navigation } from 'lucide-react';
import toast from 'react-hot-toast';

import { haversineDistanceKm } from '../utils/geoTrip';

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('This browser does not support location.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      (error) => reject(error),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });
}

export default function TripMeter({ onMeasured, disabled }) {
  // 'idle' -> 'started' -> back to 'idle' after a measurement or cancel
  const [phase, setPhase] = useState('idle');
  const [startPoint, setStartPoint] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleStart = async () => {
    setBusy(true);
    try {
      const point = await getPosition();
      setStartPoint(point);
      setPhase('started');
      toast.success("Start point captured. Tap 'End trip' when you arrive.");
    } catch (error) {
      toast.error(
        error?.code === 1 /* PERMISSION_DENIED */
          ? 'Location access was denied - you can still type the distance in by hand.'
          : 'Could not get your location. You can still type the distance in by hand.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleEnd = async () => {
    if (!startPoint) return;
    setBusy(true);
    try {
      const endPoint = await getPosition();
      const km = haversineDistanceKm(startPoint, endPoint);
      onMeasured(Math.round(km * 10) / 10);
      toast.success(`Measured ${(Math.round(km * 10) / 10)} km - review it below before logging.`);
    } catch {
      toast.error('Could not get your location for the end point.');
    } finally {
      setBusy(false);
      setPhase('idle');
      setStartPoint(null);
    }
  };

  const handleCancel = () => {
    setPhase('idle');
    setStartPoint(null);
  };

  return (
    <div style={{ marginTop: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
      {phase === 'idle' ? (
        <button
          type="button"
          onClick={handleStart}
          disabled={disabled || busy}
          className="eco-btn eco-btn-outline"
          style={{ fontSize: '0.78rem', padding: '0.4rem 0.8rem' }}
        >
          {busy ? <Loader2 size={14} style={{ animation: 'eco-spin 0.8s linear infinite' }} /> : <MapPin size={14} />}
          Measure this trip
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={handleEnd}
            disabled={busy}
            className="eco-btn eco-btn-primary"
            style={{ fontSize: '0.78rem', padding: '0.4rem 0.8rem' }}
          >
            {busy ? <Loader2 size={14} style={{ animation: 'eco-spin 0.8s linear infinite' }} /> : <Navigation size={14} />}
            End trip
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={busy}
            className="eco-btn eco-btn-ghost"
            style={{ fontSize: '0.78rem', padding: '0.4rem 0.8rem' }}
          >
            Cancel
          </button>
          <span className="eco-text-muted" style={{ fontSize: '0.72rem' }}>Start point saved - travel, then tap End.</span>
        </>
      )}
      <span className="eco-text-muted" style={{ fontSize: '0.68rem', flexBasis: '100%' }}>
        A straight-line distance between two points, not a real route - a rough estimate to fill in the field, not a GPS tracker running in the background.
      </span>
    </div>
  );
}
