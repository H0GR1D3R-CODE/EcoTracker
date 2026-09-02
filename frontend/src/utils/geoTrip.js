// EcoTrack/frontend/src/utils/geoTrip.js
// Pure distance maths for TripMeter.jsx - no network calls, no storage.
// See TripMeter.jsx's own module comment for the privacy/scope reasoning
// (two GPS fixes, in memory only, never sent anywhere).

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

// The standard great-circle (Haversine) distance between two lat/lon
// points, in kilometres. Fine for a single commute-length trip - it does
// not account for actual road routing, so it will always read a little
// under the real driven/ridden distance (a straight line vs. following
// roads), which is a real, stated limitation worth surfacing in the UI
// rather than silently presenting a route-accurate figure it is not.
export function haversineDistanceKm(start, end) {
  const dLat = toRadians(end.latitude - start.latitude);
  const dLon = toRadians(end.longitude - start.longitude);
  const lat1 = toRadians(start.latitude);
  const lat2 = toRadians(end.latitude);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}
