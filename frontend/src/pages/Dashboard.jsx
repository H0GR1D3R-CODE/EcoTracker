// EcoTrack/frontend/src/pages/Dashboard.jsx
//
// PLACEHOLDER - this file will be replaced when the Dashboard module is built.
// It exists now so the router compiles and you can navigate the whole app.
//
// When built, this page will contain:
//   * four animated stat cards (this month, this year, best category, active goals)
//   * a 6-month line chart with a gradient fill under the line
//   * a doughnut chart of the category breakdown
//   * a bar chart comparing this month against last month
//   * a silent refresh every 60 seconds
// Data source: GET /api/dashboard/summary

import { Link } from 'react-router-dom';
import { LayoutDashboard, Plus } from 'lucide-react';

import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { profile } = useAuth();

  // profile.name is "Aadi Santhosh"; split(' ')[0] gives just "Aadi"
  const firstName = profile?.name?.split(' ')[0] || 'there';

  return (
    <div className="container" style={{ paddingTop: '2.5rem', paddingBottom: '3rem' }}>
      <h1 style={{ fontSize: 'clamp(1.7rem, 4vw, 2.4rem)', marginBottom: '0.4rem' }}>
        Welcome back, <span className="eco-gradient-text">{firstName}</span>
      </h1>
      <p className="eco-text-muted" style={{ marginBottom: '2rem' }}>
        Here is where your footprint will appear.
      </p>

      <div className="eco-card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
        <LayoutDashboard size={44} style={{ color: 'var(--eco-primary)', opacity: 0.6 }} />

        <h2 style={{ fontSize: '1.3rem', marginTop: '1.2rem', marginBottom: '0.6rem' }}>
          Dashboard coming next
        </h2>

        <p className="eco-text-muted" style={{ maxWidth: 460, margin: '0 auto 1.6rem' }}>
          Stat cards, the six-month trend line and the category breakdown charts
          are the next module to be built. The backend routes they read from are
          already live.
        </p>

        <Link to="/calculator" className="eco-btn eco-btn-primary">
          <Plus size={17} />
          Log your first emission
        </Link>
      </div>
    </div>
  );
}
