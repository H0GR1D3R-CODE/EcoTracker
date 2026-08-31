// EcoTrack/frontend/src/pages/Faq.jsx
// Public FAQ page - linked from the footer's "Get started" column. Static
// content, no login, no backend call, the same category as About/Learn/
// Feedback: every claim on it has to stay true to what the rest of the app
// actually does, since a visitor reads this before ever creating an account.
//
// Grouped by topic rather than one long flat list, and each answer opens
// independently (not a single-open accordion) - someone comparing two
// related answers (donations vs. tax-deductibility, say) should not have to
// choose which one to lose to read the other.

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronDown,
  Compass,
  Database,
  HeartHandshake,
  HelpCircle,
  Sparkles,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import Photo from '../components/Photo';
import { PHOTOS } from '../utils/photos';
import { useTheme } from '../context/ThemeContext';

const FAQ_CATEGORIES = [
  {
    heading: 'Getting started',
    icon: Compass,
    items: [
      {
        q: 'Is EcoTrack free?',
        a: 'Completely. Create an account and log as much as you like — there is nothing to pay and no card required.',
      },
      {
        q: 'Do I need an account to use any of it?',
        a: 'No. The footprint Estimate tool, About, Learn, Gallery, donating, and asking the EcoTrack Guide in the corner of the screen all work without signing in. An account is only needed to save your own history, set goals, and generate reports over time.',
      },
      {
        q: 'How long does it take to get started?',
        a: 'About thirty seconds. Log one activity — a car journey or an electricity bill — and the whole dashboard comes to life around it.',
      },
      {
        q: 'What can I actually track?',
        a: 'Seven categories: transport, electricity, fuel, water, waste, diet and consumption. Each has its own published emission factors behind it.',
      },
    ],
  },
  {
    heading: 'The numbers',
    icon: Sparkles,
    items: [
      {
        q: 'Where do the emission factors come from?',
        a: 'Published sources only — DEFRA, the IPCC, India’s Central Electricity Authority, and Our World in Data. Nothing is invented, and nothing is a rough guess.',
      },
      {
        q: 'How accurate is it?',
        a: 'As accurate as a self-reported footprint calculator can be: every figure uses a real, published conversion factor, but this is an estimate of scale and direction, not a certified emissions audit.',
      },
      {
        q: 'Why does my region matter?',
        a: 'Electricity’s carbon intensity varies hugely by grid — the region you choose picks the right grid factor for every electricity entry you log.',
      },
    ],
  },
  {
    heading: 'Your data & privacy',
    icon: Database,
    items: [
      {
        q: 'Who can see my data?',
        a: 'Only you. Sign-in runs through Firebase Authentication, and the server verifies your identity before any of your data is ever read. The admin console only ever sees platform-wide totals, never your individual records.',
      },
      {
        q: 'Can I delete my account and data?',
        a: 'Yes — Profile → Data & account has a permanent delete option that removes your records, goals, reports and any household or team membership.',
      },
      {
        q: 'Does EcoTrack work without an internet connection?',
        a: 'Yes. Log an entry with no connection and it is saved on your device, then synced automatically the next time you’re back online.',
      },
      {
        q: 'What can the AI assistant actually see?',
        a: 'Only your own footprint data once you’re signed in — and, for an admin account specifically, platform-wide totals. It answers questions and reads data; it cannot change anything on its own.',
      },
    ],
  },
  {
    heading: 'Household & Team mode',
    icon: Users,
    items: [
      {
        q: 'What is Household / Classroom-Team mode?',
        a: 'A small, invite-code-joined group — a family, a hostel room, a class, or a workplace team — with a combined footprint, a shared weekly challenge, and a leaderboard ranked by effort (points), not by whose life happens to emit less.',
      },
      {
        q: 'How big can a group get?',
        a: 'A household holds up to 10 people. Choosing Classroom/Team mode when you create the group raises that to 60, and gives its organizer the ability to choose which category that week’s shared challenge targets.',
      },
      {
        q: 'Who can remove someone from a group?',
        a: 'Only the household owner or organizer can remove another member. Anyone can leave a group on their own, at any time.',
      },
    ],
  },
  {
    heading: 'Donations',
    icon: HeartHandshake,
    items: [
      {
        q: 'Where does my donation actually go?',
        a: 'Forwarded in full, minus only Razorpay’s payment-processing fee, to four established organisations: One Tree Planted, Cool Earth, Clean Air Task Force and Gold Standard. EcoTrack keeps nothing.',
      },
      {
        q: 'Do I get a receipt?',
        a: 'Yes — a branded PDF receipt is emailed to you automatically right after paying, and you can download the same PDF again any time from the thank-you page.',
      },
      {
        q: 'Is my donation tax-deductible?',
        a: 'No. EcoTrack is a student project and is not registered for 80G. The receipt is a payment record, not a tax-exemption certificate.',
      },
      {
        q: 'Do I need an account to donate?',
        a: 'No — anyone can give without ever signing in.',
      },
    ],
  },
];

function FaqItem({ q, a, isOpen, onToggle }) {
  return (
    <div style={{ borderBottom: '1px solid var(--rule)' }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        style={{
          display: 'flex',
          width: '100%',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          padding: '1.1rem 0',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          font: 'inherit',
          color: 'inherit',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: '0.98rem' }}>{q}</span>
        <ChevronDown
          size={18}
          style={{
            flexShrink: 0,
            color: 'var(--eco-text-muted)',
            transform: isOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.25s ease',
          }}
        />
      </button>

      {/* A plain conditional, not AnimatePresence - the same class of bug
          fixed across this app's other disclosure widgets (SelectField.jsx,
          Household.jsx's MemberRow): opening a second answer after closing
          a first one risks a stale, invisible-but-still-mounted copy, or
          the answer simply failing to close, since an exit animation here
          never reports complete. */}
      {isOpen && (
        <p
          className="eco-text-muted"
          style={{ margin: '0 0 1.2rem', fontSize: '0.9rem', lineHeight: 1.7, maxWidth: '66ch' }}
        >
          {a}
        </p>
      )}
    </div>
  );
}

export default function Faq() {
  const { prefersReducedMotion } = useTheme();

  // Which answers are open, keyed "categoryIndex-itemIndex" - a Set rather
  // than a single index, so opening one answer never closes another the
  // visitor was in the middle of comparing it to.
  const [openKeys, setOpenKeys] = useState(() => new Set());

  const toggle = (key) => {
    setOpenKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem', maxWidth: 780 }}>
      {/* ---------- hero ---------- */}
      <div style={{ marginBottom: 'clamp(2.2rem, 5vw, 3rem)' }}>
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.85rem',
            flexWrap: 'wrap',
            marginBottom: '2rem',
          }}
        >
          <span className="eco-marker">FAQ</span>
          <span className="eco-readout" style={{ fontSize: '0.86rem', fontWeight: 600 }}>
            NO ACCOUNT NEEDED
          </span>
          <span className="eco-marker" style={{ opacity: 0.6 }}>answers, not marketing</span>
          <span style={{ width: 46, height: 1, background: 'var(--rule-strong)' }} />
        </motion.div>

        <h1
          className="eco-display"
          style={{ fontSize: 'clamp(2.4rem, 7.5vw, 4.2rem)', margin: '0 0 1.3rem' }}
        >
          Questions, <span className="eco-gradient-text">answered</span>
        </h1>
        <p
          className="eco-text-muted"
          style={{ fontSize: 'clamp(1rem, 2.2vw, 1.1rem)', maxWidth: '58ch', margin: 0 }}
        >
          The things people actually ask, grouped by topic. Can&apos;t find yours? The{' '}
          <HelpCircle size={15} style={{ verticalAlign: -2, display: 'inline' }} /> guide in the
          corner of the screen can answer almost anything else, or send it in through{' '}
          <Link to="/feedback" style={{ color: 'var(--eco-primary)', fontWeight: 600 }}>
            Feedback
          </Link>
          .
        </p>
      </div>

      {/* ---------- a photograph, once, between the hero and the answers ---------- */}
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="eco-photo-zoom"
        style={{
          overflow: 'hidden',
          borderRadius: 'var(--eco-radius-sm)',
          height: 'clamp(160px, 24vh, 240px)',
          marginBottom: 'clamp(2.5rem, 6vw, 3.5rem)',
        }}
      >
        <Photo
          id={PHOTOS.libraryStacks}
          alt="A dim library corridor of shelves lit by a row of hanging bulbs"
          width={1200}
          className="eco-photo-cover"
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
      </motion.div>

      {/* ---------- the questions, grouped by topic ---------- */}
      <div style={{ display: 'grid', gap: 'clamp(2.2rem, 5vw, 3rem)' }}>
        {FAQ_CATEGORIES.map((category, categoryIndex) => {
          const Icon = category.icon;
          return (
            <motion.section
              key={category.heading}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.45 }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.55rem',
                  marginBottom: '0.4rem',
                  paddingBottom: '0.9rem',
                  borderBottom: '1px solid var(--rule-strong)',
                }}
              >
                <Icon size={17} style={{ color: 'var(--eco-primary)' }} />
                <h2 className="eco-display" style={{ fontSize: '1.15rem', margin: 0 }}>
                  {category.heading}
                </h2>
              </div>

              {category.items.map((item, itemIndex) => {
                const key = `${categoryIndex}-${itemIndex}`;
                return (
                  <FaqItem
                    key={key}
                    q={item.q}
                    a={item.a}
                    isOpen={openKeys.has(key)}
                    onToggle={() => toggle(key)}
                  />
                );
              })}
            </motion.section>
          );
        })}
      </div>

      {/* ---------- one more way to reach a person ---------- */}
      <div
        style={{
          marginTop: 'clamp(2.5rem, 6vw, 3.5rem)',
          paddingTop: '1.3rem',
          borderTop: '1px solid var(--rule-strong)',
          textAlign: 'center',
        }}
      >
        <p className="eco-text-muted" style={{ fontSize: '0.92rem', margin: '0 0 1rem' }}>
          Still stuck? A real person reads every message.
        </p>
        <Link to="/feedback" className="eco-btn eco-btn-outline">
          <HelpCircle size={16} />
          Ask us directly
        </Link>
      </div>
    </div>
  );
}
