// EcoTrack/frontend/src/components/ActivityHeatmap.jsx
// A GitHub-style contribution grid of the last ~13 weeks: one cell per day,
// filled if the user logged anything that day. Reads `activeDates` off
// GET /api/engagement/streak, which already computes exactly this set while
// working out the streak (see routes/engagement.py:streak) - no second
// endpoint needed for what is really the same underlying data.

import { useRef, useState, useEffect } from 'react';

import { engagementApi } from '../utils/api';
import { useStaggerReveal } from '../hooks/useScrollReveal';
import { formatDate } from '../utils/formatters';

const WEEKS = 13;
const CELL = 12;
const GAP = 3;

function buildGrid(activeDates) {
  const activeSet = new Set(activeDates);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Start on the Monday of the week WEEKS-1 weeks ago, so the grid always
  // ends on the current week's column regardless of which day today is.
  const daysSinceMonday = (today.getDay() + 6) % 7;
  const gridStart = new Date(today);
  gridStart.setDate(today.getDate() - daysSinceMonday - (WEEKS - 1) * 7);

  const columns = [];
  for (let week = 0; week < WEEKS; week += 1) {
    const column = [];
    for (let day = 0; day < 7; day += 1) {
      const cellDate = new Date(gridStart);
      cellDate.setDate(gridStart.getDate() + week * 7 + day);
      const iso = cellDate.toISOString().slice(0, 10);
      column.push({ iso, active: activeSet.has(iso), future: cellDate > today });
    }
    columns.push(column);
  }
  return columns;
}

export default function ActivityHeatmap() {
  const [activeDates, setActiveDates] = useState(null);
  const gridRef = useStaggerReveal('.eco-heatmap-cell', { y: 6, duration: 0.35, stagger: 0.006 });

  useEffect(() => {
    let cancelled = false;
    engagementApi
      .getStreak()
      .then((data) => {
        if (!cancelled) setActiveDates(data.activeDates || []);
      })
      .catch(() => {
        if (!cancelled) setActiveDates([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (activeDates === null) return null;

  const columns = buildGrid(activeDates);

  return (
    <div>
      <div ref={gridRef} style={{ display: 'flex', gap: GAP, overflowX: 'auto', paddingBottom: 4 }}>
        {columns.map((column, weekIndex) => (
          <div key={weekIndex} style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
            {column.map((cell) => (
              <div
                key={cell.iso}
                className="eco-heatmap-cell"
                title={cell.future ? '' : `${formatDate(cell.iso)}${cell.active ? ' — logged' : ''}`}
                style={{
                  width: CELL,
                  height: CELL,
                  borderRadius: 3,
                  background: cell.future
                    ? 'transparent'
                    : cell.active
                      ? 'var(--eco-primary)'
                      : 'var(--rule)',
                  opacity: cell.future ? 0 : cell.active ? 1 : 0.6,
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--eco-text-muted)', marginTop: '0.5rem' }}>
        <span>{WEEKS} weeks ago</span>
        <span>Today</span>
      </div>
    </div>
  );
}
