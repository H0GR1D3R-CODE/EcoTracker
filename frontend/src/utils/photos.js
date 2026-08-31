// EcoTrack/frontend/src/utils/photos.js
//
// One place for every real photograph used across the public pages and the
// dashboard. These are Unsplash photos (real photographers, free licence, not
// AI-generated), served straight from Unsplash's image CDN.
//
// Each theme has SEVERAL variants (factory, factory2, factory3 …) so the same
// picture never repeats across pages — the Gallery, Home strip, Learn articles
// and Dashboard each get a different-but-on-topic photo of the same subject.
// Keeping the ids here means any one can be swapped without touching a page.

export const PHOTOS = {
  // industry / manufacturing
  factory: '1516937941344-00b4e0337589', // factories releasing smoke  (Gallery)
  factory2: '1611273426858-450d8e3c9fce', // industrial harbour + smokestack (Home)
  factory3: '1511454493857-0a29f2c023c7', // black metal industrial plant (Dashboard)

  // transport
  traffic: '1519994007676-baabab4bf574', // aerial motorway full of cars (Gallery)
  traffic2: '1530685932526-48ec92998eaa', // cars flowing both directions (Home)
  traffic3: '1569261655993-3ae347322edd', // aerial shot of vehicles (Learn)
  traffic4: '1602951172321-fe0aa8865e6b', // cars on a road (Dashboard)

  // energy / electricity grid
  powerPlant: '1664284163483-e6ce0a068a20', // power-station smokestacks by water (Gallery)
  powerPlant2: '1681504787493-c5e3b8c16813', // industrial stacks billowing smoke (Home)
  powerPlant3: '1473341304170-971dccb5ac1e', // transmission towers / the grid (Learn)
  powerPlant4: '1552772588-12592fc15a64', // an electricity pylon in a field (Dashboard)

  // nature / forests
  forest: '1476231682828-37e571bc172f', // aerial road through green forest (Gallery)
  forest2: '1640125346217-e4bb9313d6bd', // aerial view of lush green forest (Home)
  forest3: '1622572860925-daa5e4219d53', // green forest on a mountainside (Dashboard)

  // renewables
  wind: '1508791290064-c27cc1ef7a9a', // wind turbines in a green field (Gallery)
  cleanEnergy: '1587168173357-99c7e95fb5cd', // turbines under a blue sky (Home)
  solar: '1509391366360-2e959784a276', // solar panels in a field (Gallery)

  // diet / food
  meal: '1512621776951-a57141f2eefd', // a bowl of vegetables (Gallery)
  meal2: '1540420773420-3366772f4999', // a fresh vegetable salad (Learn)

  // consumption / electronics
  electronics: '1579803166678-7acf374cfe52', // a green circuit board (Gallery)
  electronics2: '1606718220923-fcb2abd9a778', // assorted electronic devices (Learn)

  // waste, water
  waste: '1632247620837-970aa94d2b99', // garbage floating in the ocean (Gallery)
  water: '1495647688236-ed6ef40cb28b', // water running from a tap (Gallery)

  // growth / people
  seedling: '1523810192022-5a0fb9aa7ff8', // a woman holding a seedling (About)
  community: '1542601906990-b4d3fb778b09', // hands cupping a seedling in soil (Feedback)
  youngTree: '1780752627969-b5550a5e97b6', // a healthy tree canopy against a clear blue sky (Dashboard: reward tree)

  // the planet
  earth: '1451187580459-43490279c0fa', // the Earth from space (Dashboard)

  // a period closing out / a recap - distinct from every forest/tree shot
  // above, a golden-hour field standing in for "looking back on a period"
  goldenHourField: '1624212933958-4aa0e1cd2e0c', // sunlit open field at golden hour (Dashboard: Carbon Wrapped)

  // signed-in page banners (distinct from every image above)
  householdHome: '1628243989859-db92e2de1340', // a family/home scene (Household banner)
  calcNature: '1621872111378-4f8340e9cb90', // green forest        (Calculator banner)
  goalsVista: '1515344905723-babc01aac23d', // wind farm on grass   (Goals banner)
  reportsPath: '1559770968-53924e9b32de', // road through a forest  (Reports banner)
  // A compass read as "navigation", not "you" - replaced with a single
  // footprint-marked path through snow, which is what a profile page is
  // actually about: a personal trail, not an instrument for finding one.
  profilePath: '1767518782545-17fa47a602e2', // a snow-covered boardwalk path through a dark forest (Profile banner)
  foggyForecast: '1485236715568-ddc5ee6ca227', // narrow road through thick morning fog (Insights banner)
  summitDawn: '1758644083602-15a9645a92a7', // misty mountain peaks at dawn (Achievements banner)

  // estimator question headers — distinct + darker-toned so they blend with the UI
  nightTraffic: '1542705959-878ca346eb20', // car light-trails at night (Estimate: transport)
  freshVeg: '1518843875459-f738682238a6', // moody assorted vegetables   (Estimate: diet)
  bulb: '1495291916458-c12f594151e7', // a glowing bulb on black          (Estimate: electricity)
  shopping: '1534452203293-494d7ddbf7e0', // a paper shopping bag         (Estimate: shopping)

  // admin console banner — dark, on-theme (city lights = energy), distinct
  adminBanner: '1609609018625-afef0a259159', // aerial city lights at night

  // donate page — dark potting soil + trowel: what support actually grows
  supportSoil: '1416879595882-3373a0480b5b', // trowel scooping dark earth (Donate)

  // donate page, the cause itself — distinct from every forest shot above
  forestWater: '1497436072909-60f360e1d4b1', // aerial forest edge meeting turquoise water (Donate hero)
  forestLake: '1473448912268-2022ce9509d8', // pine forest around a still lake (Donate: what it protects)
  planetB: '1552799446-159ba9523315', // "There is no Planet B" climate march placard (Donate: why)

  // donate thank-you — the payoff, kept separate from the images on the form
  ancientTree: '1518495973542-4542c06a5843', // sun bursting through an ancient fig's canopy (thank-you hero)
  seedlings: '1466692476868-aef1dfb1e735', // seedlings sprouting in a soil tray (thank-you: what it becomes)

  // FAQ page — a place to go and get an answer, lit rather than sterile
  libraryStacks: '1481627834876-b7833e8f5570', // dark library corridor, shelves lit by hanging bulbs (FAQ banner)
};

/**
 * Build an Unsplash CDN url for a photo id at a given pixel width.
 * auto=format serves modern formats, fit=crop fills the box without distortion.
 */
export const photoUrl = (id, width = 900) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${width}&q=70`;
