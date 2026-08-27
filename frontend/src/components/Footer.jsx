// EcoTrack/frontend/src/components/Footer.jsx
// The site footer for the public marketing pages.
//
// Like PublicHelper, this is only for signed-out visitors: it returns null once
// someone is signed in, so the in-app pages (dashboard, admin) stay clean and
// the mobile bottom-nav never fights a big marketing footer for space.
//
// Every external link points at a real, relevant source (the UN, the IPCC,
// DEFRA, Our World in Data) - the same places EcoTrack's emission factors come
// from - and opens in a new tab. Internal links use the router.

import { Link } from 'react-router-dom';
import { ArrowUpRight, Heart, Leaf } from 'lucide-react';

import { useAuth } from '../context/AuthContext';

// Internal navigation, grouped into columns like a normal site footer.
const LINK_COLUMNS = [
  {
    heading: 'Explore',
    links: [
      { label: 'Home', to: '/' },
      { label: 'About', to: '/about' },
      { label: 'Learn', to: '/learn' },
      { label: 'Gallery', to: '/gallery' },
      { label: 'Estimate your footprint', to: '/estimate' },
      { label: 'Collective impact', to: '/impact' },
    ],
  },
  {
    heading: 'Get started',
    links: [
      { label: 'Create account', to: '/register' },
      { label: 'Log in', to: '/login' },
      { label: 'Give feedback', to: '/feedback' },
      { label: 'Support EcoTrack', to: '/donate' },
    ],
  },
];

// External sources - the real references behind EcoTrack's numbers.
const SOURCE_LINKS = [
  { label: 'UN SDG 13: Climate Action', href: 'https://sdgs.un.org/goals/goal13' },
  { label: 'IPCC assessment reports', href: 'https://www.ipcc.ch/reports/' },
  { label: 'DEFRA emission factors', href: 'https://www.gov.uk/government/collections/government-conversion-factors-for-company-reporting' },
  { label: 'Our World in Data — CO₂', href: 'https://ourworldindata.org/co2-emissions' },
  { label: 'IEA — International Energy Agency', href: 'https://www.iea.org' },
  { label: 'Global Carbon Project', href: 'https://www.globalcarbonproject.org' },
];

export default function Footer() {
  const { user } = useAuth();

  // Signed-in users are inside the app; the footer belongs to the public site.
  if (user) return null;

  const year = new Date().getFullYear();

  return (
    <footer
      style={{
        borderTop: '1px solid var(--eco-border)',
        background: 'var(--eco-bg-alt)',
        marginTop: '3rem',
        // extra bottom room so the last row clears the floating helper button
        padding: '3rem 0 4.5rem',
      }}
    >
      <div className="container">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(220px, 1.4fr) repeat(3, minmax(140px, 1fr))',
            gap: '2rem',
          }}
          className="eco-footer-grid"
        >
          {/* ---- brand block ---- */}
          <div>
            <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.9rem' }}>
              <span style={{ display: 'flex', color: 'var(--eco-primary)' }}>
                <Leaf size={24} />
              </span>
              <span
                className="eco-gradient-text"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: '1.25rem',
                  letterSpacing: '-0.03em',
                }}
              >
                EcoTrack
              </span>
            </Link>

            <p
              className="eco-text-muted"
              style={{ fontSize: '0.88rem', lineHeight: 1.7, margin: '0 0 1rem', maxWidth: 300 }}
            >
              Turn everyday choices — travel, power, food — into a carbon number
              you can see and bring down. Built around UN Sustainable Development
              Goal 13: Climate Action.
            </p>

            {/* Citation, not a pill - the same instrument notation used for
                every "SDG 13" reference elsewhere in the app. */}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
              <Leaf size={13} style={{ color: 'var(--eco-primary)', flexShrink: 0 }} />
              <span className="eco-marker">SDG 13 · Climate Action</span>
            </span>

            {/* Hosting this costs a little; this is the one ask on the page.
                Outline, not solid - the footer should not shout. */}
            <Link
              to="/donate"
              className="eco-btn eco-btn-outline"
              style={{ marginTop: '1.2rem', fontSize: '0.86rem' }}
            >
              <Heart size={15} />
              Support EcoTrack
            </Link>
          </div>

          {/* ---- internal link columns ---- */}
          {LINK_COLUMNS.map((column) => (
            <div key={column.heading}>
              <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.9rem' }}>
                {column.heading}
              </h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.6rem' }}>
                {column.links.map((link) => (
                  <li key={link.to}>
                    <Link to={link.to} className="eco-footer-link">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* ---- external sources column ---- */}
          <div>
            <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.9rem' }}>
              The science
            </h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.6rem' }}>
              {SOURCE_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="eco-footer-link"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                  >
                    {link.label}
                    <ArrowUpRight size={13} style={{ flexShrink: 0, opacity: 0.7 }} />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ---- bottom bar ---- */}
        <div
          style={{
            marginTop: '2.5rem',
            paddingTop: '1.4rem',
            borderTop: '1px solid var(--eco-border)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.6rem 1.4rem',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <p className="eco-text-muted" style={{ fontSize: '0.82rem', margin: 0 }}>
            © {year} EcoTrack · A BCA specialisation project · Christ University
          </p>
          <p className="eco-text-muted" style={{ fontSize: '0.82rem', margin: 0 }}>
            Measure · Understand · Reduce
          </p>
        </div>
      </div>
    </footer>
  );
}
