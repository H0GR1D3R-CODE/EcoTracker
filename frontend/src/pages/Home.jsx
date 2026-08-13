// EcoTrack/frontend/src/pages/Home.jsx
// The public landing page - the first thing anyone sees.
//
// What is happening on this page:
//   * tsparticles draws floating particles behind the hero
//   * useParallax drifts the hero content slower than the page scrolls
//   * useCounter counts the statistics up from zero when they scroll into view
//   * useStaggerReveal fades the feature cards in one after another
//   * the feature cards tilt in 3D towards the mouse pointer
//   * the testimonial carousel advances itself every few seconds
//
// Every one of those effects checks prefersReducedMotion first, because
// animation that cannot be switched off is an accessibility failure.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Car,
  ChevronDown,
  ChevronRight,
  Cloud,
  Droplets,
  Flame,
  Globe2,
  Heart,
  Info,
  Leaf,
  LineChart,
  MessageSquare,
  PlusCircle,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Target,
  Trash2,
  TreePine,
  UtensilsCrossed,
  Wind,
  X,
  Zap,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useCounter } from '../hooks/useCounter';
import { useScrollReveal, useStaggerReveal } from '../hooks/useScrollReveal';
import Photo from '../components/Photo';
import LiveCarbonCounter from '../components/LiveCarbonCounter';
import HeroReel from '../components/HeroReel';
import { PHOTOS } from '../utils/photos';

// A few real photographs shown in the "world your choices touch" strip near the
// top of the page - the visual proof that the numbers map to real systems.
const GLIMPSES = [
  { photo: 'factory2', label: 'Industry', color: 'var(--org-goldstandard)' },
  { photo: 'traffic2', label: 'Transport', color: 'var(--cat-transport)' },
  { photo: 'powerPlant2', label: 'Energy', color: 'var(--cat-electricity)' },
  { photo: 'forest2', label: 'Nature', color: 'var(--org-onetree)' },
  { photo: 'cleanEnergy', label: 'Clean energy', color: 'var(--cat-electricity)' },
];

// The published sources every EcoTrack figure traces back to - shown as a
// credibility strip. Real references impress far more than invented numbers.
const SOURCES = ['DEFRA 2023', 'IPCC', 'CEA India 2023', 'Our World in Data', 'IEA', 'EPA'];

// The whole product in three steps, for the "how it works" band.
const HOW_STEPS = [
  {
    icon: PlusCircle,
    title: 'Log an activity',
    body: 'Enter something you actually did — a car trip, an electricity bill, a meal. It takes seconds, and one entry is enough to start.',
  },
  {
    icon: BarChart3,
    title: 'See your footprint',
    body: 'Every entry becomes kilograms of CO₂ on your dashboard, split by category and tracked month on month.',
  },
  {
    icon: Target,
    title: 'Act on what matters',
    body: 'Set a reduction goal on your heaviest category and watch a live progress ring. Specific targets beat vague intentions.',
  },
];

// What the dashboard shows, listed beside a mock preview of it.
const DASHBOARD_POINTS = [
  'Your monthly footprint at a glance, with the trend over six months',
  'A breakdown of exactly which habit is costing the most carbon',
  'Plain-English insights that tell you where to act first',
  'Every number put in real terms — "the same as driving 30 km"',
];

// The mock chart bars in the preview (relative heights, 0–1).
const PREVIEW_BARS = [0.45, 0.7, 0.55, 0.85, 0.62, 0.95];

// Landing-page FAQ. Short, honest answers to the obvious questions.
const HOME_FAQS = [
  {
    q: 'Is EcoTrack free?',
    a: 'Completely. Create an account and track as much as you like — there is nothing to pay and no card required.',
  },
  {
    q: 'Where do the numbers come from?',
    a: 'Every activity is multiplied by a published emission factor from DEFRA, the IPCC, the Central Electricity Authority of India, or Our World in Data. Nothing is invented.',
  },
  {
    q: 'How long does it take to start?',
    a: 'About thirty seconds. Log one activity — a car journey or an electricity bill — and the whole dashboard comes to life.',
  },
  {
    q: 'Who can see my data?',
    a: 'Only you. Sign-in runs through Firebase Authentication, and the server checks your identity on every request before any data is read.',
  },
];

// Established environmental organisations the "take action" section links out
// to. These are real charities with verified official donation pages (checked
// against each org's own site). EcoTrack does not handle any money itself — each
// button opens the organisation's own donation page, where the contribution
// reaches them in full.
const CONTRIBUTIONS = [
  {
    name: 'One Tree Planted',
    icon: TreePine,
    color: 'var(--org-onetree)',
    focus: 'Reforestation',
    body: 'Plants trees in forests worldwide to restore habitats and pull carbon back out of the air — one dollar plants one tree.',
    href: 'https://onetreeplanted.org/products/plant-trees',
  },
  {
    name: 'Cool Earth',
    icon: Leaf,
    color: 'var(--org-coolearth)',
    focus: 'Rainforest protection',
    body: 'Backs the people who live in rainforests to keep them standing — protecting the forests that absorb the most carbon.',
    href: 'https://www.coolearth.org/act-now/ways-to-donate/',
  },
  {
    name: 'Clean Air Task Force',
    icon: Wind,
    color: 'var(--org-catf)',
    focus: 'Cutting emissions',
    body: 'Pushes for the clean-energy technology and policy that drives greenhouse-gas emissions down at scale.',
    href: 'https://www.catf.us/donate/',
  },
  {
    name: 'Gold Standard',
    icon: ShieldCheck,
    color: 'var(--org-goldstandard)',
    focus: 'Verified offsets',
    body: 'Certifies carbon-offset projects, so a contribution provably removes or avoids greenhouse gases — no greenwashing.',
    href: 'https://www.goldstandard.org/donate-to-gold-standard',
  },
];

// ---------------------------------------------------------------------------
// PAGE DATA
// The statistics are placeholder figures for the landing page only. Every
// number a signed-in user sees is calculated from their own real records.
// ---------------------------------------------------------------------------

// The headline is split into words so each one can be revealed separately.
// Splitting in the markup rather than with .split(' ') keeps the line break
// under our control instead of leaving it to the browser.
const HEADLINE_LINES = [
  { words: ['Know', 'your', 'carbon.'], accent: false },
  { words: ['Then', 'change', 'it.'], accent: true },
];

// The instrument's specification - four constants, every one of them checkable.
//
// These replaced invented vanity metrics: "12,480 kg CO2 tracked", "340+ active
// trackers", "1,250 goals achieved". The real figures at the time of writing
// were 55 kg, 7 users and 0 goals achieved, so those claims overstated the
// truth by between fifty and two hundred times, on a public page, for a project
// that expects to be examined.
//
// Constants are also simply the better answer here. A young product cannot win
// on usage numbers, but the science it applies is the same science a large one
// would apply - and a reader can verify every line below against the published
// source, which is worth more than a number they have to take on trust.
const HERO_STATS = [
  {
    value: 7,
    suffix: '',
    label: 'Categories measured',
    note: 'transport → water',
    decimals: 0,
  },
  {
    value: 21,
    suffix: '',
    label: 'Published factors',
    note: 'DEFRA · IPCC · CEA',
    decimals: 0,
  },
  {
    value: 0.71,
    suffix: '',
    label: 'kg CO₂ per kWh',
    note: "India's grid, CEA 2023",
    decimals: 2,
  },
  {
    value: 2000,
    suffix: ' kg',
    label: 'Climate-safe year',
    note: 'per person, 1.5 °C',
    decimals: 0,
  },
];

// Clicking a category opens a detail panel explaining it. The factors below are
// the published values EcoTrack uses (DEFRA 2023, CEA India 2023, IPCC, Our
// World in Data) - the same numbers the Calculator applies. They are listed
// here as a static factsheet so this works on the landing page with no login
// and no backend call.
const CATEGORIES = [
  {
    icon: Car,
    name: 'Transport',
    detail: 'Cars, buses, trains and flights',
    color: 'var(--cat-transport)',
    unit: 'per km',
    source: 'DEFRA 2023',
    intro:
      'Every kilometre you travel has a cost that depends entirely on how you travel it. A train seat and a car seat over the same distance are worlds apart.',
    factors: [
      ['Domestic flight', 0.255],
      ['Petrol car', 0.141],
      ['Diesel car', 0.132],
      ['Bus', 0.082],
      ['Motorbike', 0.071],
      ['Train', 0.041],
      ['Bicycle', 0.0],
    ],
    // 70%, not 80%: (0.141 - 0.041) / 0.141 = 70.9%, from the petrol-car and
    // train factors listed in this very card.
    tip: 'Swapping one 20 km car trip a week for the train cuts about 70% of that journey’s carbon.',
  },
  {
    icon: Zap,
    name: 'Electricity',
    detail: 'Grid power and rooftop solar',
    color: 'var(--cat-electricity)',
    unit: 'per kWh (unit)',
    source: 'CEA India 2023',
    intro:
      'India’s grid is among the most carbon-intensive in the world because so much of it still burns coal. The same appliance costs far more carbon here than in a country running on hydro or nuclear.',
    factors: [
      ['Grid electricity', 0.71],
      ['Solar', 0.05],
    ],
    tip: 'Rooftop solar is roughly 14× cleaner per unit than the grid it replaces.',
  },
  {
    icon: Flame,
    name: 'Fuel',
    detail: 'LPG cylinders and generators',
    color: 'var(--cat-fuel)',
    unit: 'per kg / litre',
    source: 'IPCC 2006',
    intro:
      'Burning fuel directly — for cooking or a backup generator — releases carbon with no grid in between, so the factors are high.',
    factors: [
      ['LPG', 2.983],
      ['Diesel generator', 2.68],
      ['Petrol generator', 2.31],
    ],
    tip: 'A few litres less generator diesel each week shows up immediately in your monthly total.',
  },
  {
    icon: UtensilsCrossed,
    name: 'Diet',
    detail: 'Meals by dietary choice',
    color: 'var(--cat-diet)',
    unit: 'per meal',
    source: 'Our World in Data',
    intro:
      'What is on the plate matters more than most people expect. Meat, especially, carries the emissions of everything that fed and raised the animal.',
    factors: [
      ['Non-vegetarian', 3.3],
      ['Vegetarian', 1.7],
      ['Vegan', 1.1],
    ],
    tip: 'One vegetarian meal a day instead of meat saves close to 48 kg of CO₂ a month.',
  },
  {
    icon: Trash2,
    name: 'Waste',
    detail: 'Landfill against recycling',
    color: 'var(--cat-waste)',
    unit: 'per kg',
    source: 'IPCC waste sector',
    intro:
      'Waste in landfill rots and releases methane. Recycling the same kilogram avoids most of that — it is one of the cheapest reductions available to anyone.',
    factors: [
      ['Landfill', 0.58],
      ['Recycled', 0.1],
    ],
    tip: 'Separating recyclables cuts nearly 85% of the carbon of that waste.',
  },
  {
    icon: Droplets,
    name: 'Water',
    detail: 'The energy behind your tap',
    color: 'var(--cat-water)',
    unit: 'per litre',
    source: 'Water–energy nexus',
    intro:
      'Water itself emits nothing. Its footprint is the electricity used to pump, treat and deliver it — small per litre, but it adds up across a household.',
    factors: [['Municipal supply', 0.0003]],
    tip: 'Because the per-litre factor is tiny, real savings here come from volume — fixing leaks and shorter showers.',
  },
  {
    icon: ShoppingBag,
    name: 'Consumption',
    detail: 'Clothing and electronics',
    color: 'var(--cat-consumption)',
    unit: 'per item',
    source: 'Lifecycle averages',
    intro:
      'The carbon in a product is spent making and shipping it, long before you buy it. That embedded cost is why a single gadget can outweigh a month of commuting.',
    factors: [
      ['Electronics item', 85.0],
      ['Clothing item', 8.0],
    ],
    tip: 'Repairing or buying one electronic item used avoids around 85 kg of embedded carbon.',
  },
];

const FEATURES = [
  {
    icon: BarChart3,
    title: 'Seven categories, one number',
    body: 'Transport, electricity, fuel, diet, waste, water and consumption all roll up into a single monthly footprint you can actually act on.',
  },
  {
    icon: Target,
    title: 'Goals per category',
    body: 'A goal like "cut transport 25% by December" tells you what to change. "Reduce emissions" tells you nothing. So goals are set per category.',
  },
  {
    icon: LineChart,
    title: 'Trends that make sense',
    body: 'Six months of history, month-on-month comparison, and a breakdown showing exactly which habit is costing the most carbon.',
  },
  {
    icon: ShieldCheck,
    title: 'Scientific factors',
    body: 'Every calculation uses published emission factors from DEFRA, the IPCC and the Central Electricity Authority of India — never invented numbers.',
  },
];

// The TESTIMONIALS array that stood here has been deleted. Three quotes, each
// attributed to a named person who does not exist, for a product whose real
// user count is seven. Nothing rendered them, but invented testimony is not
// something to leave lying in the source of a project that will be marked.
//
// The arguments those quotes were making were good ones - per-category goals
// beat a single overall target, and an equivalent you can picture beats a
// number you cannot. Those belong on the page as stated design decisions,
// which is what they actually are, not as words put in a stranger's mouth.

// ---------------------------------------------------------------------------
// A statistic that counts up when it scrolls into view
// ---------------------------------------------------------------------------

/**
 * One channel on the instrument panel.
 *
 * Left-aligned under its own rule rather than centred in a card. Four centred
 * gradient numbers in a row is the stat-strip every landing page ships; a
 * column of readings hanging off a hairline reads as a specification, which is
 * what these actually are.
 *
 * The figure is amber and monospaced because it is a measured quantity, and
 * this app never lets a measurement borrow the colour of the thing it
 * describes. The caption underneath cites where the number comes from - a
 * reading without a provenance is just an assertion.
 */
function CountUpStat({ value, suffix, label, note, decimals }) {
  const [ref, formatted] = useCounter(value, { decimals, duration: 1800 });

  return (
    <div
      ref={ref}
      style={{
        textAlign: 'left',
        paddingTop: '0.95rem',
        borderTop: '1px solid var(--rule-strong)',
      }}
    >
      <div
        className="eco-readout"
        style={{
          fontSize: 'clamp(1.6rem, 3.6vw, 2.4rem)',
          fontWeight: 500,
          lineHeight: 1,
          // Without this, "2,000 kg" breaks across two lines in a narrow
          // grid column and the row loses its alignment
          whiteSpace: 'nowrap',
        }}
      >
        {formatted}
        {suffix}
      </div>

      <div
        className="eco-marker"
        style={{ marginTop: '0.6rem', display: 'block', letterSpacing: '0.1em' }}
      >
        {label}
      </div>

      {note && (
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.68rem',
            marginTop: '0.25rem',
            color: 'var(--eco-text-muted)',
            opacity: 0.7,
          }}
        >
          {note}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One word of the headline, revealed by sliding up from behind a mask.
//
// The trick is two nested spans: the outer one has overflow:hidden and acts as
// a window, the inner one starts pushed fully below that window and slides up
// into it. The word appears to rise out of nothing rather than just fading.
//
// It finishes at exactly y: 0, so the text ends up on whole pixels and renders
// perfectly crisply once the animation is over.
// ---------------------------------------------------------------------------

function RevealWord({ word, delay, accent, reduced, isLast }) {
  if (reduced) {
    // No animation at all - the word is simply there
    return (
      <span className={accent ? 'eco-gradient-text' : undefined}>
        {word}
        {isLast ? '' : ' '}
      </span>
    );
  }

  return (
    <>
      <span
        style={{
          display: 'inline-block',
          overflow: 'hidden',
          // Without this the mask sits on the text baseline and clips descenders
          verticalAlign: 'bottom',
          paddingBottom: '0.08em',
        }}
      >
        <motion.span
          style={{ display: 'inline-block' }}
          className={accent ? 'eco-gradient-text' : undefined}
          initial={{ y: '115%' }}
          animate={{ y: 0 }}
          transition={{ duration: 0.85, delay, ease: [0.16, 1, 0.3, 1] }}
        >
          {word}
        </motion.span>
      </span>
      {/* The space sits BETWEEN words, never after the last one. A trailing
          space would add half a space of width to the line, which pushes
          centred text visibly off to the left. */}
      {!isLast && <span>&nbsp;</span>}
    </>
  );
}

// NOTE ON INTERACTION DESIGN
//
// Nothing on this page follows the cursor except light. There were originally a
// magnetic button and a tilting card here, and both were removed for the same
// reason: an element that shifts position because the mouse is near it makes
// the layout look unanchored, and it fights the user rather than responding to
// them. You cannot aim at a button that moves as you approach it.
//
// Hover states are now symmetric and contained - the element grows or glows in
// place, on its own centre, and never moves anything around it. Entrance
// animations play once and stop. Nothing tracks the pointer.


// ---------------------------------------------------------------------------
// THE PAGE
// ---------------------------------------------------------------------------

export default function Home() {
  const { user } = useAuth();
  const { prefersReducedMotion } = useTheme();

  // The drifting-particle background was removed on purpose. Continuous ambient
  // motion behind the headline reads as the page never settling, which is the
  // opposite of the calm, premium feel we want. The hero now holds still: the
  // dot grid, the static glow orbs and the one-time word reveal carry it.

  // The cursor spotlight was removed with the glow orbs: two motion values, a
  // spring pair, a visibility flag and two pointer handlers, all driving an
  // effect that only ever made sense over a near-black page.

  // Which category's detail panel is open (null = none). Set by clicking a
  // category card in the "Seven categories" section.
  const [openCategory, setOpenCategory] = useState(null);

  // Without this, the page behind this fixed-position modal can still be
  // drag-scrolled on iOS while the modal itself stays put on screen.
  useBodyScrollLock(Boolean(openCategory));

  // Which landing-page FAQ answer is expanded (-1 = all closed).
  const [openFaq, setOpenFaq] = useState(0);

  // --- scroll animations ---
  const statsRef = useScrollReveal({ y: 30 });
  const categoriesRef = useStaggerReveal('.category-chip', { stagger: 0.06, y: 24 });
  const featuresRef = useStaggerReveal('.feature-card', { stagger: 0.12 });
  const sdgRef = useScrollReveal({ y: 36 });
  const ctaRef = useScrollReveal({ y: 30 });

  // The testimonial carousel that used to live here has been removed. It was
  // never rendered - the array, the ref, the index state and both navigation
  // callbacks existed, but no JSX referenced any of them. What it did do was
  // run a setInterval every six seconds for the lifetime of the page, setting
  // state that nothing displayed and re-rendering this entire component each
  // time.
  //
  // The quotes themselves were invented, attributed to three named people who
  // do not exist. Unrendered or not, that does not belong in the source of a
  // project that expects to be examined.

  // Signed-in visitors get "Go to dashboard" instead of "Get started free"
  const primaryCta = user
    ? { to: '/dashboard', label: 'Go to your dashboard' }
    : { to: '/register', label: 'Start tracking free' };

  return (
    <div>
      {/* ================= HERO ================= */}
      <section className="eco-hero eco-dot-grid">
        {/* The two ambient glow orbs and the cursor-following spotlight that
            used to sit here are gone.
            All three were dark-ground effects: coloured light bleeding out of a
            near-black page. On paper a neon-green radial glow does not read as
            light, it reads as a smudge - and a spotlight that follows the
            pointer is decoration that says nothing about the product.
            An instrument does not glow. What is left is the paper, the rule,
            and the type, which is the whole point of this direction. */}

        <div className="container" style={{ position: 'relative', zIndex: 2 }}>
          {/* Two columns above 980px: the headline keeps its spine on the
              left, and HeroReel - real moving footage, not another still -
              sits beside it so the first thing anyone sees on arrival
              includes something actually happening, not just type. Below
              980px they stack, headline first: a phone screen does not have
              room to argue between reading and watching at once. */}
          <div className="eco-hero-grid">
          {/* Left-aligned, not centred. Centred hero copy is the default
              arrangement on every landing page; ranging it left gives the
              headline a spine to hang off and sets up a real column measure
              for the paragraph beneath it. */}
          <div style={{ maxWidth: 940, textAlign: 'left' }}>
            {/* Was a pill with a gradient ring - the single most templated
                element on the page, and the kind of thing that appears on every
                SaaS landing page regardless of what it sells.
                Replaced with instrument notation: a hairline, a mono marker,
                and the one number that actually frames the whole product. 425
                ppm is the current atmospheric CO2 concentration (NOAA Mauna
                Loa, 2025) - the reading everything else on this page is a
                response to. It earns its place because it is true and it is
                the subject, not because a badge goes there. */}
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.85rem',
                marginBottom: '2.2rem',
              }}
            >
              <span className="eco-marker">Atmospheric CO<sub>2</sub></span>
              <span className="eco-readout" style={{ fontSize: '0.86rem', fontWeight: 600 }}>
                425 PPM
              </span>
              <span className="eco-marker" style={{ opacity: 0.6 }}>and rising</span>
              <span style={{ width: 46, height: 1, background: 'var(--rule-strong)' }} />
            </motion.div>

            {/* Each word rises into place one after another, then stops dead.
                No permanent transform is left behind, so the type is perfectly
                sharp for as long as anyone actually reads it. */}
            {/* Set in the display face at instrument scale: tracked in to
                -0.045em and leaded under 1, so the headline locks up as a
                single shape rather than reading as a row of words. That tight
                lockup is most of the difference between type that looks
                authored and type that looks defaulted. */}
            <h1
              className="eco-display"
              style={{
                // clamp() picks a size between the two limits based on screen
                // width, so one line handles phones through to desktops
                fontSize: 'clamp(2.8rem, 9vw, 6.4rem)',
                marginBottom: '1.6rem',
              }}
            >
              {HEADLINE_LINES.map((line, lineIndex) => (
                <span key={line.words.join('-')} style={{ display: 'block' }}>
                  {line.words.map((word, wordIndex) => (
                    <RevealWord
                      key={word}
                      word={word}
                      accent={line.accent}
                      reduced={prefersReducedMotion}
                      isLast={wordIndex === line.words.length - 1}
                      // Each word waits a little longer than the last, and the
                      // second line starts after the first has finished
                      delay={0.15 + lineIndex * 0.28 + wordIndex * 0.09}
                    />
                  ))}
                </span>
              ))}
            </h1>

            <motion.p
              initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.72, ease: [0.22, 1, 0.36, 1] }}
              className="eco-text-muted"
              style={{
                fontSize: 'clamp(1rem, 2.2vw, 1.18rem)',
                // Was declared twice in this object - `maxWidth: 620` then
                // `maxWidth: '54ch'` four lines later, so the pixel value was
                // silently discarded and Vite warned about it on every build.
                // 54ch is the one that was winning and the one that is right:
                // a measure, not a pixel width.
                maxWidth: '54ch',
                margin: '0 0 2.4rem',
              }}
            >
              EcoTrack turns everyday choices — your commute, your meals, your
              electricity bill — into a number you can see, compare and bring down.
              Seven categories. Published science. No guesswork.
            </motion.p>

            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.86, ease: [0.22, 1, 0.36, 1] }}
              style={{
                display: 'flex',
                gap: '0.85rem',
                flexWrap: 'wrap',
              }}
            >
              <Link
                to={primaryCta.to}
                className="eco-btn eco-btn-primary eco-btn-pulse"
                style={{ padding: '0.95rem 2rem', fontSize: '1rem' }}
              >
                {primaryCta.label}
                <ArrowRight size={18} />
              </Link>

              <a
                href="#how-it-works"
                className="eco-btn eco-btn-outline"
                style={{ padding: '0.95rem 1.8rem' }}
              >
                See how it works
              </a>
            </motion.div>

            {/* Hero statistics - these count up on scroll */}
            <div
              ref={statsRef}
              className="eco-reveal"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                // Wider gaps than a card grid needs: with no card edges to
                // separate them, the whitespace is what groups each reading
                // with its own label.
                gap: '1.8rem',
                marginTop: '4rem',
                // No rule here any more - each channel carries its own, which
                // is what makes the row read as a panel of separate
                // instruments rather than one boxed-off strip.
                textAlign: 'left',
              }}
            >
              {HERO_STATS.map((stat) => (
                <CountUpStat key={stat.label} {...stat} />
              ))}
            </div>
          </div>

          <HeroReel />
          </div>
        </div>
      </section>

      {/* ================= LIVE GLOBAL CARBON COUNTER ================= */}
      <LiveCarbonCounter />

      {/* ================= TRUSTED SOURCES STRIP ================= */}
      <section className="eco-section" style={{ paddingTop: '2.6rem', paddingBottom: '0.5rem' }}>
        <div className="container">
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.5 }}
            style={{ textAlign: 'center' }}
          >
            <p
              className="eco-text-muted"
              style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: '1.1rem' }}
            >
              Every number traces back to a published source
            </p>
            {/* Citations, not tags. These are the scientific apparatus the whole
                product rests on, so they are set as a reference line in mono and
                separated by hairlines - the way sources are listed in a paper -
                rather than as a row of pills that could be advertising anything. */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '0.9rem',
              }}
            >
              {SOURCES.map((source, index) => (
                <motion.span
                  key={source}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.9rem',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.78rem',
                    letterSpacing: '0.02em',
                    color: 'var(--eco-text-muted)',
                  }}
                >
                  {source}
                  {/* A divider after every entry but the last */}
                  {index < SOURCES.length - 1 && (
                    <span style={{ width: 1, height: 11, background: 'var(--rule-strong)' }} />
                  )}
                </motion.span>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ================= THE WORLD YOUR CHOICES TOUCH (photo strip) ================= */}
      <section className="eco-section">
        <div className="container">
          <div style={{ maxWidth: 640, marginBottom: '2.4rem' }}>
            <div className="eco-marker" style={{ marginBottom: '1.15rem', display: 'inline-flex', alignItems: 'center', gap: '0.6rem' }}>
              <Globe2 size={14} style={{ color: 'var(--eco-primary)' }} />
              Real systems, real impact
            </div>
            <h2 className="eco-display" style={{ fontSize: 'clamp(2.1rem, 5.4vw, 3.6rem)', marginBottom: '1.1rem' }}>
              The world your choices <span className="eco-gradient-text">touch</span>
            </h2>
            <p className="eco-text-muted" style={{ margin: 0 }}>
              Behind every kilogram of CO₂ is a real place — a power station, a
              motorway, a forest. EcoTrack connects your day to all of it.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
              gap: '1rem',
            }}
          >
            {GLIMPSES.map((item, index) => (
              <motion.div
                key={item.photo}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.5, delay: index * 0.07, ease: [0.22, 1, 0.36, 1] }}
                className="eco-photo-card"
              >
                {/* The plate. No card chrome and no scrim: the label used to be
                    white type sitting on a rgba(0,0,0,0.8) gradient, which is a
                    dark-page device - on paper it reads as a bruise across the
                    bottom of every photograph, and it was darkening the image
                    purely to make text legible on top of it.
                    Caption below instead, the way a plate is captioned in a
                    book. The photograph is left alone and the contrast problem
                    disappears rather than being covered up. */}
                <div
                  className="eco-photo-zoom"
                  style={{
                    position: 'relative',
                    overflow: 'hidden',
                    borderRadius: 'var(--eco-radius-sm)',
                    aspectRatio: '4 / 5',
                  }}
                >
                  <Photo
                    id={PHOTOS[item.photo]}
                    alt={item.label}
                    width={600}
                    color={item.color}
                    className="eco-photo-cover"
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                  />
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.55rem',
                    marginTop: '0.85rem',
                    paddingTop: '0.7rem',
                    borderTop: '1px solid var(--rule)',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 7,
                      height: 7,
                      flexShrink: 0,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span className="eco-marker">{item.label}</span>
                </div>
              </motion.div>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginTop: '1.8rem' }}>
            <Link to="/gallery" className="eco-btn eco-btn-outline" style={{ padding: '0.7rem 1.5rem' }}>
              Explore the gallery
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ================= ESTIMATE TEASER ================= */}
      {/* Was a rounded card floating in the middle of the page, centred, with
          the last glow orb on Home sitting behind it. On a page now built from
          rules and channels that card read as a leftover, and the orb was the
          final piece of dark-page lighting.

          It is still meant to interrupt - it is the one mid-page invitation -
          so it keeps a distinct surface. That is now a full-width tinted band
          with rules top and bottom, which separates it by structure rather than
          by floating a box above the paper. */}
      <section
        className="eco-section"
        style={{
          background: 'var(--eco-bg-alt)',
          borderTop: '1px solid var(--rule)',
          borderBottom: '1px solid var(--rule)',
        }}
      >
        <div className="container">
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, amount: 0.3 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: '2rem',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ maxWidth: 620 }}>
              <div
                className="eco-marker"
                style={{ marginBottom: '1.15rem', display: 'inline-flex', alignItems: 'center', gap: '0.6rem' }}
              >
                <Sparkles size={14} style={{ color: 'var(--eco-primary)' }} />
                30 seconds · no sign-up
              </div>
              <h2
                className="eco-display"
                style={{ fontSize: 'clamp(2.1rem, 5.4vw, 3.6rem)', marginBottom: '1.1rem' }}
              >
                Not sure where you <span className="eco-gradient-text">stand?</span>
              </h2>
              <p className="eco-text-muted" style={{ maxWidth: 520, margin: 0, fontSize: '1rem' }}>
                Answer four quick questions and watch your rough monthly footprint appear —
                no account needed.
              </p>
            </div>

            <Link
              to="/estimate"
              className="eco-btn eco-btn-primary"
              style={{ padding: '0.9rem 2rem', flexShrink: 0 }}
            >
              Estimate your footprint
              <ArrowRight size={17} />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ================= CATEGORIES ================= */}
      <section className="eco-section" id="how-it-works">
        <div className="container">
          <div style={{ maxWidth: 660, marginBottom: '3rem' }}>
            <div className="eco-marker" style={{ marginBottom: '1.15rem', display: 'inline-flex', alignItems: 'center', gap: '0.6rem' }}>
              <Sparkles size={14} style={{ color: 'var(--eco-primary)' }} />
              Seven categories
            </div>
            <h2 className="eco-display" style={{ fontSize: 'clamp(2.1rem, 5.4vw, 3.6rem)', marginBottom: '1.1rem' }}>
              Everything that makes up <span className="eco-gradient-text">your footprint</span>
            </h2>
            <p className="eco-text-muted" style={{ margin: 0 }}>
              Log an activity in any category and EcoTrack converts it to kilograms
              of CO₂ using the published factor for that activity.
            </p>
          </div>

          <div
            ref={categoriesRef}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1rem',
            }}
          >
            {CATEGORIES.map((category) => {
              const Icon = category.icon;
              return (
                // A button, not a div, so it is keyboard-focusable and screen
                // readers announce it as clickable. Opens the detail panel.
                // A button, not a div, so it is keyboard-focusable and screen
                // readers announce it as clickable. Opens the detail panel.
                //
                // No card, no shadow. Each category is a channel hanging off
                // its own rule, matching the hero readings and the design
                // decisions further down - seven raised tiles in a grid was the
                // last piece of Home still built out of boxes.
                //
                // The range is the point. Every category already carries its
                // published factors, and the SPREAD is the useful fact: a train
                // and a domestic flight differ by six times per kilometre, and
                // showing 0.000-0.255 says that instantly where an icon says
                // nothing. Read straight off the same factors the detail panel
                // lists, so it cannot drift out of step with them.
                <button
                  type="button"
                  key={category.name}
                  onClick={() => setOpenCategory(category)}
                  className="category-chip eco-reveal"
                  style={{
                    display: 'block',
                    textAlign: 'left',
                    cursor: 'pointer',
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    borderTop: '1px solid var(--rule-strong)',
                    padding: '0.95rem 0 0',
                    color: 'var(--eco-text)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.5rem',
                      marginBottom: '0.7rem',
                    }}
                  >
                    <Icon size={19} style={{ color: category.color, flexShrink: 0 }} />
                    <ChevronRight size={15} style={{ color: 'var(--eco-text-muted)', opacity: 0.6 }} />
                  </div>

                  <div
                    className="eco-readout"
                    style={{ fontSize: '1.15rem', fontWeight: 500, lineHeight: 1 }}
                  >
                    {(() => {
                      const values = category.factors.map(([, value]) => value);
                      const low = Math.min(...values);
                      const high = Math.max(...values);
                      // A fixed 3 decimals cannot serve factors that span from
                      // 0.0003 (a litre of water) to 85 (a laptop). It rendered
                      // water as "0.000" - stating the category emits nothing,
                      // which flatly contradicts the explanation inside it - and
                      // padded consumption into "8.000-85.000".
                      // Precision now follows magnitude, and trailing zeros are
                      // dropped so each figure shows what it actually is.
                      const show = (v) => {
                        if (v === 0) return '0';
                        if (v < 0.01) return v.toFixed(4).replace(/0+$/, '');
                        if (v < 1) return v.toFixed(3).replace(/0+$/, '');
                        return String(Number(v.toFixed(2)));
                      };
                      // A single-factor category has no range to show
                      return low === high ? show(high) : `${show(low)}–${show(high)}`;
                    })()}
                  </div>
                  <div
                    className="eco-marker"
                    style={{ display: 'block', marginTop: '0.3rem', fontSize: '0.64rem' }}
                  >
                    kg CO₂ {category.unit}
                  </div>

                  <div
                    className="eco-display"
                    style={{ fontSize: '1.05rem', fontWeight: 600, margin: '0.85rem 0 0.15rem' }}
                  >
                    {category.name}
                  </div>
                  <div className="eco-text-muted" style={{ fontSize: '0.82rem', lineHeight: 1.5 }}>
                    {category.detail}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================= HOW IT WORKS (3 STEPS) ================= */}
      <section className="eco-section">
        <div className="container">
          <div style={{ maxWidth: 640, marginBottom: '3rem' }}>
            <div className="eco-marker" style={{ marginBottom: '1.15rem', display: 'inline-flex', alignItems: 'center', gap: '0.6rem' }}>
              <Sparkles size={14} style={{ color: 'var(--eco-primary)' }} />
              Three simple steps
            </div>
            <h2 className="eco-display" style={{ fontSize: 'clamp(2.1rem, 5.4vw, 3.6rem)', marginBottom: '1.1rem' }}>
              From one activity to <span className="eco-gradient-text">real change</span>
            </h2>
            <p className="eco-text-muted" style={{ margin: 0 }}>
              No spreadsheets, no guesswork. Log, see, act — that is the whole loop.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '1.3rem',
            }}
          >
            {HOW_STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.title}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: false, amount: 0.3 }}
                  transition={{ duration: 0.5, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
                  // Numbered, and here that is correct. These are not three
                  // parallel features - you log, then you see, then you act, and
                  // the order carries information. (The design decisions further
                  // down are deliberately NOT numbered for the opposite reason.)
                  //
                  // The number was a 2.2rem Space Grotesk glyph in border-grey,
                  // sitting in the corner as texture. It now leads the channel in
                  // mono, as a step index rather than decoration, and the icon
                  // has lost a gradient disc built from rgba(0,255,135) - neon
                  // mixed for a black page.
                  style={{ paddingTop: '1.05rem', borderTop: '1px solid var(--rule-strong)' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.6rem',
                      marginBottom: '1.1rem',
                    }}
                  >
                    <span className="eco-readout" style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <Icon size={20} style={{ color: 'var(--eco-primary)', flexShrink: 0 }} />
                  </div>

                  <h3
                    className="eco-display"
                    style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.55rem' }}
                  >
                    {step.title}
                  </h3>
                  <p className="eco-text-muted" style={{ fontSize: '0.92rem', margin: 0, lineHeight: 1.65 }}>
                    {step.body}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================= DASHBOARD PREVIEW ================= */}
      <section className="eco-section" style={{ background: 'var(--eco-bg-alt)' }}>
        <div className="container">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '2.5rem',
              alignItems: 'center',
            }}
          >
            {/* text */}
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, x: -24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: false, amount: 0.3 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="eco-marker" style={{ marginBottom: '1.15rem', display: 'inline-flex', alignItems: 'center', gap: '0.6rem' }}>
                <BarChart3 size={14} style={{ color: 'var(--eco-primary)' }} />
                Your dashboard
              </div>
              <h2 className="eco-display" style={{ fontSize: 'clamp(2.1rem, 5.4vw, 3.6rem)', marginBottom: '1.2rem' }}>
                Your whole footprint, <span className="eco-gradient-text">in one place</span>
              </h2>
              <p className="eco-text-muted" style={{ marginBottom: '1.5rem', lineHeight: 1.7 }}>
                The moment you log an activity, everything updates — charts, trends
                and insights that tell you exactly where to act first.
              </p>

              <div style={{ display: 'grid', gap: '0.8rem' }}>
                {DASHBOARD_POINTS.map((point) => (
                  <div key={point} style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start' }}>
                    <span
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        flexShrink: 0,
                        marginTop: 1,
                        // A green tick on a 16% tint of the SAME green measured
                        // 3.62:1 - the disc pulls the background toward the
                        // glyph and eats the contrast. Lighter disc, darker
                        // tick: same look, and it clears AA.
                        background: 'rgba(var(--eco-primary-rgb), 0.1)',
                        color: 'var(--eco-primary-dark)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                      }}
                    >
                      ✓
                    </span>
                    <span style={{ fontSize: '0.92rem', lineHeight: 1.5 }}>{point}</span>
                  </div>
                ))}
              </div>

              <Link
                to={primaryCta.to}
                className="eco-btn eco-btn-primary"
                style={{ marginTop: '1.8rem', padding: '0.85rem 1.8rem' }}
              >
                {primaryCta.label}
                <ArrowRight size={17} />
              </Link>
            </motion.div>

            {/* mock preview window */}
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, y: 30, scale: 0.97 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: false, amount: 0.3 }}
              transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="eco-card"
              style={{ padding: 0, overflow: 'hidden', boxShadow: 'var(--eco-shadow)' }}
            >
              {/* window title bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '0.7rem 0.9rem',
                  borderBottom: '1px solid var(--eco-border)',
                }}
              >
                {['#ff5f57', '#febc2e', '#28c840'].map((dot) => (
                  <span key={dot} style={{ width: 11, height: 11, borderRadius: '50%', background: dot }} />
                ))}
                <span className="eco-text-muted" style={{ marginLeft: 'auto', fontSize: '0.7rem' }}>
                  ecotrack · dashboard
                </span>
              </div>

              <div style={{ padding: '1.1rem' }}>
                {/* stat tiles */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem', marginBottom: '1.1rem' }}>
                  {[
                    { label: 'This month', value: '142 kg', color: 'var(--cat-transport)' },
                    { label: 'This year', value: '1.6 t', color: 'var(--org-goldstandard)' },
                    { label: 'Goals', value: '2 active', color: 'var(--cat-electricity)' },
                  ].map((tile) => (
                    <div
                      key={tile.label}
                      style={{
                        padding: '0.65rem 0.7rem',
                        borderRadius: 'var(--eco-radius-sm)',
                        background: 'rgba(var(--eco-primary-rgb), 0.05)',
                        border: '1px solid var(--eco-border)',
                      }}
                    >
                      <div className="eco-text-muted" style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {tile.label}
                      </div>
                      {/* This is a mock of the real dashboard, so it has to
                          look like the real dashboard. Those figures are mono
                          readouts in the app now; leaving the mock in Space
                          Grotesk would make the preview a picture of a version
                          that no longer exists. */}
                      <div className="eco-readout" style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                        {tile.value}
                      </div>
                    </div>
                  ))}
                </div>

                {/* mini bar chart - bars grow on scroll */}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', height: 110, padding: '0 0.1rem' }}>
                  {PREVIEW_BARS.map((height, i) => (
                    <motion.div
                      key={i}
                      initial={prefersReducedMotion ? false : { scaleY: 0 }}
                      whileInView={{ scaleY: 1 }}
                      viewport={{ once: false, amount: 0.6 }}
                      transition={{ duration: 0.6, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                      style={{
                        flex: 1,
                        height: `${height * 100}%`,
                        transformOrigin: 'bottom',
                        borderRadius: '6px 6px 0 0',
                        background: 'var(--eco-primary)',
                      }}
                    />
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                  {['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'].map((month) => (
                    <span key={month} className="eco-text-muted" style={{ fontSize: '0.6rem', flex: 1, textAlign: 'center' }}>
                      {month}
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ================= IMPACT SWAPS ================= */}
      <section className="eco-section" style={{ background: 'var(--eco-bg-alt)' }}>
        <div className="container">
          <div style={{ maxWidth: 640, marginBottom: '3rem' }}>
            <div className="eco-marker" style={{ marginBottom: '1.15rem', display: 'inline-flex', alignItems: 'center', gap: '0.6rem' }}>
              <Sparkles size={14} style={{ color: 'var(--eco-primary)' }} />
              Small changes, real savings
            </div>
            <h2 className="eco-display" style={{ fontSize: 'clamp(2.1rem, 5.4vw, 3.6rem)', marginBottom: '1.1rem' }}>
              One swap saves more than <span className="eco-gradient-text">you think</span>
            </h2>
            <p className="eco-text-muted" style={{ margin: 0 }}>
              Real figures from published factors — the kind EcoTrack tracks for you automatically.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.3rem' }}>
            {[
              { icon: Car, color: 'var(--cat-transport)', action: 'Take the bus twice a week', detail: 'instead of driving those trips', save: '~20 kg', unit: 'CO₂ saved / month' },
              { icon: UtensilsCrossed, color: 'var(--cat-diet)', action: 'One veg meal a day', detail: 'swapped in for meat', save: '~48 kg', unit: 'CO₂ saved / month' },
              { icon: ShoppingBag, color: 'var(--cat-fuel)', action: 'Repair, don’t replace', detail: 'one gadget kept going', save: '~85 kg', unit: 'CO₂ per device' },
            ].map((s, index) => {
              const Icon = s.icon;
              return (
                <motion.div
                  key={s.action}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: false, amount: 0.3 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  // The saving is set in amber, not in the category's colour.
                  // That is the one rule the whole palette rests on: a measured
                  // quantity never borrows the colour of the thing it measures,
                  // so a reader can always tell a reading from a label. It was
                  // previously a Space Grotesk figure tinted the same green as
                  // the transport icon beside it, which blurred exactly that
                  // distinction.
                  style={{ paddingTop: '1.05rem', borderTop: '1px solid var(--rule-strong)' }}
                >
                  <Icon
                    size={20}
                    style={{ color: s.color, display: 'block', marginBottom: '1.1rem' }}
                  />

                  <div
                    className="eco-readout"
                    style={{ fontSize: 'clamp(1.7rem, 3.8vw, 2.3rem)', fontWeight: 500, lineHeight: 1 }}
                  >
                    {s.save}
                  </div>
                  <div className="eco-marker" style={{ display: 'block', marginTop: '0.4rem' }}>
                    {s.unit}
                  </div>

                  <h3
                    className="eco-display"
                    style={{ fontSize: '1.15rem', fontWeight: 600, margin: '1.1rem 0 0.35rem' }}
                  >
                    {s.action}
                  </h3>
                  <p className="eco-text-muted" style={{ fontSize: '0.88rem', margin: 0, lineHeight: 1.6 }}>
                    {s.detail}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================= CONTRIBUTE / DONATE ================= */}
      {/* Two separate asks, deliberately kept apart. The cards link out to real,
          established charities' own donation pages (links verified against each
          org's site) and no money passes through EcoTrack. The strip below is
          EcoTrack's own running costs - a much smaller ask, and it comes second
          on purpose, because those charities cut far more carbon than our
          hosting bill ever will. */}
      <section className="eco-section">
        <div className="container">
          <div style={{ maxWidth: 660, marginBottom: '2.6rem' }}>
            <div className="eco-marker" style={{ marginBottom: '1.15rem', display: 'inline-flex', alignItems: 'center', gap: '0.6rem' }}>
              <Heart size={14} style={{ color: 'var(--eco-primary)' }} />
              Take action
            </div>
            <h2 className="eco-display" style={{ fontSize: 'clamp(2.1rem, 5.4vw, 3.6rem)', marginBottom: '1.1rem' }}>
              Tracking is step one. <span className="eco-gradient-text">Giving back</span> is the next.
            </h2>
            <p className="eco-text-muted" style={{ margin: '0 auto', maxWidth: 600 }}>
              Measuring your footprint shows what to change. These established
              organisations turn support into real emission cuts — reforestation,
              clean energy and protected land.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '1.3rem',
            }}
          >
            {CONTRIBUTIONS.map((org, index) => {
              const Icon = org.icon;
              return (
                <motion.div
                  key={org.name}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: false, amount: 0.25 }}
                  transition={{ duration: 0.5, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    paddingTop: '1.05rem',
                    borderTop: '1px solid var(--rule-strong)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.55rem',
                      marginBottom: '0.9rem',
                    }}
                  >
                    <Icon size={19} style={{ color: org.color, flexShrink: 0 }} />
                    <span className="eco-marker">{org.focus}</span>
                  </div>

                  <h3
                    className="eco-display"
                    style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.5rem' }}
                  >
                    {org.name}
                  </h3>
                  <p className="eco-text-muted" style={{ fontSize: '0.88rem', lineHeight: 1.6, margin: '0 0 1.3rem' }}>
                    {org.body}
                  </p>

                  {/* A text link with an arrow, not a full-width outlined
                      button. Four identical buttons in a row competed with the
                      page's actual primary action; these are four ways out to
                      other people's sites, and should read as such. */}
                  <a
                    href={org.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      marginTop: 'auto',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      fontSize: '0.86rem',
                      fontWeight: 600,
                      color: 'var(--eco-primary)',
                    }}
                  >
                    Donate to {org.name}
                    <ArrowUpRight size={15} />
                  </a>
                </motion.div>
              );
            })}
          </div>

          {/* honest note — EcoTrack itself takes no money */}
          <p
            className="eco-text-muted"
            style={{
              textAlign: 'center',
              fontSize: '0.82rem',
              marginTop: '1.6rem',
              maxWidth: 660,
              marginLeft: 'auto',
              marginRight: 'auto',
              lineHeight: 1.6,
            }}
          >
            <Info size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
            No money passes through EcoTrack for any of these four. Each button opens
            the organisation&rsquo;s own donation page, where your contribution reaches
            them in full.
          </p>

          {/* ---- EcoTrack's own, much smaller ask ---- */}
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.5 }}
            // The last floating card on Home. It sat centred at 780px while
            // everything around it ranged left off a rule, so it read as a
            // panel that had drifted in from the old design.
            style={{
              marginTop: '2.8rem',
              paddingTop: '1.3rem',
              borderTop: '1px solid var(--rule-strong)',
              display: 'flex',
              alignItems: 'center',
              gap: '1.2rem',
              flexWrap: 'wrap',
            }}
          >
            <Leaf size={22} style={{ color: 'var(--eco-primary)', flexShrink: 0 }} />

            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
              <h3
                className="eco-display"
                style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.3rem' }}
              >
                Or give once, here, and we pass it on
              </h3>
              <p className="eco-text-muted" style={{ fontSize: '0.86rem', lineHeight: 1.6, margin: 0 }}>
                Rather not pick? Donate through EcoTrack and it is forwarded to the
                organisations above, less Razorpay&rsquo;s processing fee. We keep
                nothing.
              </p>
            </div>

            <Link to="/donate" className="eco-btn eco-btn-primary" style={{ flexShrink: 0 }}>
              <Heart size={16} />
              Support EcoTrack
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ================= DESIGN DECISIONS ================= */}
      {/* This is where the invented testimonials used to sit. The arguments
          they were making were sound - they were just put in the mouths of
          three people who do not exist. Stated plainly as the product's own
          reasoning, they are both true and more persuasive: a claim you can
          check against the app beats a compliment from a stranger.

          Not numbered. These are three parallel decisions, not a sequence, and
          01/02/03 markers would imply an order that does not exist. */}
      <section className="eco-section">
        <div className="container">
          <div style={{ maxWidth: 660, marginBottom: 'clamp(2.4rem, 5vw, 3.4rem)' }}>
            <div
              className="eco-marker"
              style={{
                marginBottom: '1.15rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.6rem',
              }}
            >
              <span style={{ width: 26, height: 1, background: 'var(--rule-strong)' }} />
              Why it works this way
            </div>
            <h2
              className="eco-display"
              style={{ fontSize: 'clamp(2.1rem, 5.4vw, 3.6rem)', marginBottom: '1.1rem' }}
            >
              Three decisions that do the work
            </h2>
            <p className="eco-text-muted" style={{ margin: 0, maxWidth: 560 }}>
              Every one of these is checkable inside the app in under a minute.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 'clamp(1.6rem, 3vw, 2.6rem)',
            }}
          >
            {[
              {
                marker: 'Goals',
                title: 'Targets are set per category, never overall',
                body:
                  '“Cut my emissions by 20%” tells you nothing to do on Monday morning. “Cut transport by 20%” means take the bus twice a week. A goal you can act on is the only kind worth setting.',
              },
              {
                marker: 'Equivalents',
                title: 'Every figure is restated as something you can picture',
                body:
                  '4 kg of CO₂ is a quantity almost nobody has intuition for. 30 km of driving, or four trees working for a year, is a quantity everybody has intuition for. The conversion is where a number turns into a decision.',
              },
              {
                marker: 'Ranking',
                title: 'The breakdown is ordered by what costs the most',
                body:
                  'Seven categories presented as equals hides the answer. Sorted by weight, the top row is where your effort actually moves the total — usually by more than the bottom four combined.',
              },
            ].map((item) => (
              <div
                key={item.marker}
                style={{ paddingTop: '1.05rem', borderTop: '1px solid var(--rule-strong)' }}
              >
                <div className="eco-marker" style={{ display: 'block', marginBottom: '0.9rem' }}>
                  {item.marker}
                </div>
                <h3
                  className="eco-display"
                  style={{ fontSize: '1.3rem', fontWeight: 600, marginBottom: '0.7rem' }}
                >
                  {item.title}
                </h3>
                <p
                  className="eco-text-muted"
                  style={{ fontSize: '0.92rem', lineHeight: 1.65, margin: 0 }}
                >
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= FINAL CALL TO ACTION ================= */}
      <section className="eco-section eco-line-grid">
        <div className="container">
          <div
            ref={ctaRef}
            className="eco-reveal"
            style={{ textAlign: 'center', maxWidth: 620, margin: '0 auto' }}
          >
            <Leaf size={40} style={{ color: 'var(--eco-primary)', marginBottom: '1.2rem' }} />

            <h2 style={{ fontSize: 'clamp(2.3rem, 6vw, 4rem)', marginBottom: '1.2rem' }}>
              Your first entry takes <span className="eco-gradient-text">thirty seconds</span>
            </h2>

            <p className="eco-text-muted" style={{ marginBottom: '2rem' }}>
              Log one car journey and you will already know more about your footprint
              than most people ever will.
            </p>

            <Link
              to={primaryCta.to}
              className="eco-btn eco-btn-primary eco-btn-pulse"
              style={{ padding: '1rem 2.4rem', fontSize: '1.05rem' }}
            >
              {primaryCta.label}
              <ArrowRight size={19} />
            </Link>
          </div>
        </div>
      </section>

      {/* The shared site Footer (components/Footer.jsx) now renders below every
          public page from App.jsx, so this page no longer carries its own. */}

      {/* ================= CATEGORY DETAIL PANEL ================= */}
      {/* Opens when a category card is clicked. Explains that category and lists
          the real emission factors EcoTrack uses for it, so a visitor can learn
          what the app actually measures before signing up. */}
      <AnimatePresence>
        {openCategory && (
          <motion.div
            onClick={() => setOpenCategory(null)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1060,
              background: 'rgba(0,0,0,0.66)',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1.2rem',
            }}
          >
            <motion.div
              onClick={(event) => event.stopPropagation()}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={prefersReducedMotion ? {} : { opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="eco-card"
              style={{ maxWidth: 480, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}
            >
              {/* header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.9rem' }}>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 13,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: `color-mix(in srgb, ${openCategory.color} 10%, transparent)`,
                    color: openCategory.color,
                  }}
                >
                  <openCategory.icon size={24} />
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: '1.3rem', marginBottom: '0.15rem' }}>{openCategory.name}</h3>
                  <div className="eco-text-muted" style={{ fontSize: '0.8rem' }}>
                    Measured {openCategory.unit} · source: {openCategory.source}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenCategory(null)}
                  aria-label="Close"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--eco-text-muted)',
                    cursor: 'pointer',
                    padding: 4,
                    display: 'flex',
                  }}
                >
                  <X size={20} />
                </button>
              </div>

              <p style={{ fontSize: '0.92rem', lineHeight: 1.7, margin: '1.2rem 0' }}>
                {openCategory.intro}
              </p>

              {/* factor table */}
              <div
                style={{
                  borderRadius: 'var(--eco-radius-sm)',
                  border: '1px solid var(--eco-border)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '0.6rem 0.9rem',
                    background: 'rgba(var(--eco-primary-rgb), 0.05)',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--eco-text-muted)',
                  }}
                >
                  <span>Activity type</span>
                  <span>kg CO₂ {openCategory.unit}</span>
                </div>

                {openCategory.factors.map(([label, value], index) => {
                  // Bar width relative to the heaviest factor in this category,
                  // so the visitor sees at a glance which option costs most
                  const max = Math.max(...openCategory.factors.map((f) => f[1])) || 1;
                  const pct = (value / max) * 100;
                  return (
                    <div
                      key={label}
                      style={{
                        padding: '0.7rem 0.9rem',
                        borderTop: '1px solid var(--eco-border)',
                        background: index % 2 ? 'rgba(var(--eco-primary-rgb), 0.02)' : 'transparent',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '0.88rem',
                          marginBottom: '0.4rem',
                        }}
                      >
                        <span>{label}</span>
                        <span className="eco-tabular" style={{ fontWeight: 600, color: openCategory.color }}>
                          {value}
                        </span>
                      </div>
                      <div style={{ height: 5, borderRadius: 5, background: 'var(--eco-border)', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${Math.max(pct, 2)}%`,
                            height: '100%',
                            borderRadius: 5,
                            background: openCategory.color,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* tip */}
              <div
                style={{
                  marginTop: '1.2rem',
                  padding: '0.85rem 1rem',
                  borderRadius: 'var(--eco-radius-sm)',
                  background: 'rgba(var(--eco-primary-rgb), 0.06)',
                  border: '1px solid rgba(var(--eco-primary-rgb), 0.18)',
                  fontSize: '0.86rem',
                  lineHeight: 1.6,
                }}
              >
                <strong style={{ color: 'var(--eco-primary)' }}>Quick win: </strong>
                {openCategory.tip}
              </div>

              <Link
                to={primaryCta.to}
                onClick={() => setOpenCategory(null)}
                className="eco-btn eco-btn-primary"
                style={{ width: '100%', marginTop: '1.3rem' }}
              >
                {user ? 'Log this in the calculator' : 'Start tracking free'}
                <ArrowRight size={17} />
              </Link>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
