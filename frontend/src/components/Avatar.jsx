// EcoTrack/frontend/src/components/Avatar.jsx
// Renders one of three things, in this priority order: a custom uploaded
// photo, a preset icon-on-colour mark, or the plain initials circle every
// account has always had - the same three states backend/routes/auth.py's
// avatarType/avatarValue pair can hold. One component, reused wherever an
// avatar is shown (Navbar, Profile, anywhere else a user's own identity mark
// appears) so all of them agree the moment someone changes theirs.

import { Bird, Droplets, Flower2, Leaf, Mountain, Sprout, Sun, TreePine } from 'lucide-react';
import { getInitials } from '../utils/formatters';

// MUST match backend/routes/auth.py's AVATAR_PRESET_IDS exactly - see that
// file's own comment on why there is no single shared source for this list
// (one is Python, one is JS - neither can import the other).
export const AVATAR_PRESETS = [
  { id: 'leaf', icon: Leaf, color: 'var(--eco-primary)', label: 'Leaf' },
  { id: 'sprout', icon: Sprout, color: 'var(--cat-transport)', label: 'Sprout' },
  { id: 'sun', icon: Sun, color: 'var(--cat-electricity)', label: 'Sun' },
  { id: 'droplets', icon: Droplets, color: 'var(--cat-water)', label: 'Droplets' },
  { id: 'mountain', icon: Mountain, color: 'var(--cat-fuel)', label: 'Mountain' },
  { id: 'flower', icon: Flower2, color: 'var(--cat-diet)', label: 'Flower' },
  { id: 'tree', icon: TreePine, color: 'var(--cat-waste)', label: 'Tree' },
  { id: 'bird', icon: Bird, color: 'var(--cat-consumption)', label: 'Bird' },
];

export default function Avatar({ profile, size = 40 }) {
  const iconSize = Math.round(size * 0.5);

  const baseStyle = {
    width: size,
    height: size,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  };

  if (profile?.avatarType === 'custom' && profile?.avatarValue) {
    return (
      <img
        src={profile.avatarValue}
        alt=""
        style={{ ...baseStyle, objectFit: 'cover' }}
      />
    );
  }

  if (profile?.avatarType === 'preset' && profile?.avatarValue) {
    const preset = AVATAR_PRESETS.find((entry) => entry.id === profile.avatarValue);
    if (preset) {
      const Icon = preset.icon;
      return (
        <div style={{ ...baseStyle, background: preset.color, color: '#fff' }}>
          <Icon size={iconSize} />
        </div>
      );
    }
  }

  // Fallback: plain initials circle, exactly what every avatar has always been
  return (
    <div
      style={{
        ...baseStyle,
        background: 'var(--eco-primary)',
        color: 'var(--eco-bg)',
        fontWeight: 700,
        fontSize: Math.round(size * 0.35),
        fontFamily: 'var(--font-display)',
      }}
    >
      {getInitials(profile?.name)}
    </div>
  );
}
