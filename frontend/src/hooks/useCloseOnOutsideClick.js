// EcoTrack/frontend/src/hooks/useCloseOnOutsideClick.js
//
// Closes an open floating panel (a popover, a chat widget) when the visitor
// clicks or taps anywhere outside it, not only via an explicit close button.
// Extracted so both Assistant.jsx and PublicHelper.jsx - two independent
// floating chat widgets, only ever one of which is mounted at a time (see
// PublicHelper.jsx's own module comment) - get the same behaviour from one
// place rather than two copies that could quietly drift apart.
//
// Takes the panel's own ref AND the launcher button's ref: without excluding
// the launcher, a click on it while the panel is open would count as
// "outside", firing this hook's setOpen(false) at the same time the
// launcher's own onClick toggles `open` back on - a race that could leave
// the panel stuck open or instantly reopened depending on handler order.
//
// "mousedown", not "click" - the same reasoning SelectField.jsx's own
// outside-click listener gives: it closes on press, before a click has a
// chance to land on whatever is newly underneath once the panel is gone.

import { useEffect } from 'react';

export function useCloseOnOutsideClick(open, onClose, ...refs) {
  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      const clickedInsideAny = refs.some(
        (ref) => ref.current && ref.current.contains(event.target)
      );
      if (!clickedInsideAny) onClose();
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open, onClose, ...refs]);
}

export default useCloseOnOutsideClick;
