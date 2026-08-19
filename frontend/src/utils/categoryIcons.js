// EcoTrack/frontend/src/utils/categoryIcons.js
// The seven category icons as direct named imports, so only these seven end
// up in any bundle that needs them - not the whole of lucide-react.
//
// CATEGORY_META.icon (emissionHelpers.js) stores each one's NAME as a string
// for components that already import lucide-react's full namespace for other
// reasons (Assistant's markdown renderer, for instance). Everywhere else -
// Calculator's category tabs, and every insights/quick-log component added
// alongside this file - should import CATEGORY_ICONS from here instead of
// writing `import * as Icons from 'lucide-react'`, which pulls every icon in
// the library into that chunk and single-handedly doubled Calculator's
// bundle size the one time it was tried (764 kB, up from ~150 kB).

import { Car, Droplets, Flame, ShoppingBag, Trash2, UtensilsCrossed, Zap } from 'lucide-react';

export const CATEGORY_ICONS = {
  transport: Car,
  electricity: Zap,
  fuel: Flame,
  diet: UtensilsCrossed,
  waste: Trash2,
  water: Droplets,
  consumption: ShoppingBag,
};

export default CATEGORY_ICONS;
