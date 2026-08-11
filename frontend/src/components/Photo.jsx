// EcoTrack/frontend/src/components/Photo.jsx
//
// A real photograph with a built-in safety net. If the image ever fails to load
// (no network, a URL that has moved), it swaps to a themed gradient of the same
// size instead of showing a broken-image icon — so a card is never blank.
//
// The caller controls sizing through `style`/`className`; this component just
// fills whatever box it is given (object-fit: cover by default).

import { useState } from 'react';

import { photoUrl } from '../utils/photos';

export default function Photo({
  id,
  alt = '',
  width = 900,
  color = 'var(--eco-primary)',
  className,
  style,
  loading = 'lazy',
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    // A flat wash of the category colour, not a gradient into a second hue.
    // The fallback should look like a deliberately empty plate, not like a
    // different design system leaking through on a bad network.
    return (
      <div
        role="img"
        aria-label={alt}
        className={className}
        style={{ ...style, background: color, opacity: 0.14 }}
      />
    );
  }

  // .eco-photo carries the house grade - see index.css. Every photograph in
  // the product passes through the same filter so thirty images by thirty
  // different photographers read as one commissioned shoot.
  return (
    <img
      src={photoUrl(id, width)}
      alt={alt}
      loading={loading}
      onError={() => setFailed(true)}
      className={className ? `eco-photo ${className}` : 'eco-photo'}
      style={{ objectFit: 'cover', ...style }}
    />
  );
}
