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
    return (
      <div
        role="img"
        aria-label={alt}
        className={className}
        style={{
          ...style,
          background: `linear-gradient(135deg, ${color}, var(--eco-purple))`,
        }}
      />
    );
  }

  return (
    <img
      src={photoUrl(id, width)}
      alt={alt}
      loading={loading}
      onError={() => setFailed(true)}
      className={className}
      style={{ objectFit: 'cover', ...style }}
    />
  );
}
