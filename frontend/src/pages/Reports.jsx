// EcoTrack/frontend/src/pages/Reports.jsx
// Generate a written summary of any period.
//
// ABOUT THE "SUMMARY" SECTION
// The paragraphs are composed by buildNarrative() below - a set of rules that
// turn the report's numbers into sentences. It is NOT a language model, and it
// should not be described as one.
//
// That is a deliberate choice, not a limitation. Every sentence on screen can
// be traced to one specific comparison in the code, which means it can be
// explained on demand and can never invent a figure. A model that occasionally
// hallucinated a number into a graded project report would be a much worse
// outcome than plain arithmetic that is always right.
//
// Mounted at /reports

import { useEffect, useMemo, useState } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { format as formatDateFns, startOfMonth, startOfYear, subMonths } from 'date-fns';
import {
  AlertCircle,
  CalendarRange,
  FileText,
  Loader2,
  Printer,
  Sparkles,
  Trash2,
  TrendingUp,
} from 'lucide-react';

import { assistantApi, getErrorMessage, reportsApi } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import ImpactEquivalents from '../components/ImpactEquivalents';
import SelectField from '../components/SelectField';
import PageBanner from '../components/PageBanner';
import { CATEGORY_META } from '../utils/emissionHelpers';
import {
  formatCategory,
  formatDate,
  formatEmission,
  formatNumber,
  formatSubType,
} from '../utils/formatters';

// The personal carbon budget consistent with holding warming to 1.5 °C is
// roughly 2 tonnes per person per year - about 5.5 kg a day.
const DAILY_BUDGET_KG = 2000 / 365;

const REPORT_TYPES = [
  { value: 'monthly', label: 'This month', hint: 'From the 1st to today' },
  { value: 'yearly', label: 'This year', hint: 'From 1 January to today' },
  { value: 'custom', label: 'Custom range', hint: 'Pick any two dates' },
];

/**
 * Turn a generated report into readable paragraphs.
 *
 * Each rule below is a plain observation: compare two numbers, describe the
 * result. Nothing here is predictive and nothing is invented.
 */
function buildNarrative(report) {
  if (!report?.data) return [];

  const { data, periodStart, periodEnd } = report;
  const paragraphs = [];

  const total = data.totalEmission || 0;
  const days = data.daysInPeriod || 1;
  const daily = data.dailyAverage || 0;

  // --- opening ---
  if (data.recordCount === 0) {
    return [
      {
        tone: 'neutral',
        text:
          `No activity was logged between ${formatDate(periodStart)} and ` +
          `${formatDate(periodEnd)}, so there is nothing to summarise for this period.`,
      },
    ];
  }

  paragraphs.push({
    tone: 'neutral',
    text:
      `Between ${formatDate(periodStart)} and ${formatDate(periodEnd)} — ${days} ` +
      `day${days === 1 ? '' : 's'} — you logged ${data.recordCount} ` +
      `activit${data.recordCount === 1 ? 'y' : 'ies'} totalling ` +
      `${formatEmission(total)}. That works out at ${formatEmission(daily)} per day.`,
  });

  // --- against the 1.5 °C budget ---
  const budgetShare = (daily / DAILY_BUDGET_KG) * 100;
  if (daily > 0) {
    paragraphs.push({
      tone: budgetShare > 100 ? 'warning' : 'good',
      text:
        budgetShare > 100
          ? `That daily average is ${formatNumber(budgetShare, 0)}% of the personal ` +
            `carbon budget consistent with 1.5 °C warming (about ` +
            `${formatNumber(DAILY_BUDGET_KG, 1)} kg per day). You are currently ` +
            `${formatNumber(budgetShare - 100, 0)}% over that line.`
          : `That daily average sits at ${formatNumber(budgetShare, 0)}% of the ` +
            `personal carbon budget consistent with 1.5 °C warming (about ` +
            `${formatNumber(DAILY_BUDGET_KG, 1)} kg per day) — inside the line.`,
    });
  }

  // --- dominant category ---
  if (data.highestCategory) {
    const { category, emission, sharePercent } = data.highestCategory;

    paragraphs.push({
      tone: sharePercent > 50 ? 'warning' : 'neutral',
      text:
        `${formatCategory(category)} was your largest source at ` +
        `${formatEmission(emission)}, which is ${formatNumber(sharePercent, 0)}% of ` +
        `everything logged. ` +
        (sharePercent > 50
          ? 'Because it is more than half the total, changes here move your footprint ' +
            'more than changes anywhere else combined.'
          : 'It is the most productive place to look first for a reduction.'),
    });
  }

  // --- single worst activity ---
  if (data.topSubTypes?.length > 0) {
    const top = data.topSubTypes[0];
    const share = total > 0 ? (top.emission / total) * 100 : 0;

    paragraphs.push({
      tone: 'neutral',
      text:
        `The single biggest contributor was ${formatSubType(top.subType)}, logged ` +
        `${top.count} time${top.count === 1 ? '' : 's'} for ${formatEmission(top.emission)} ` +
        `— ${formatNumber(share, 0)}% of the period's total.`,
    });
  }

  // --- worst day ---
  if (data.highestDay) {
    paragraphs.push({
      tone: 'neutral',
      text:
        `Your heaviest single day was ${formatDate(data.highestDay.date)} at ` +
        `${formatEmission(data.highestDay.emission)}, ` +
        `${formatNumber(data.highestDay.emission / (daily || 1), 1)}× your average day ` +
        `across this period.`,
    });
  }

  // --- one concrete suggestion, tied to the dominant category ---
  const suggestions = {
    // 5 kg, not 6: (0.141 - 0.082) x 20 km = 1.18 kg a trip, x 4.33 weeks =
    // 5.1 kg a month. The two factors are quoted in the sentence itself, so an
    // overstatement here is one a reader can catch with a calculator.
    transport:
      'Replacing one 20 km car trip a week with the bus saves roughly 5 kg of CO₂ a month, ' +
      'because a bus seat is 0.082 kg per km against a petrol car at 0.141.',
    electricity:
      'Grid electricity in India is 0.710 kg per unit — among the highest anywhere, because ' +
      'the grid is coal-heavy. Cutting 30 units a month saves over 21 kg.',
    fuel:
      'Generator hours are expensive in carbon terms: diesel is 2.68 kg per litre. Even a few ' +
      'litres less each week is a visible change to this figure.',
    diet:
      'Swapping one non-vegetarian meal a day for a vegetarian one saves about 1.6 kg daily, ' +
      'close to 48 kg a month, without changing anything else.',
    waste:
      'Landfill waste is 0.58 kg per kg against 0.10 for recycling. Separating waste is ' +
      'the cheapest reduction available to most people.',
    water:
      'Water has a small factor per litre, so meaningful savings here come from volume — ' +
      'shorter showers and fixing leaks rather than small daily habits.',
    consumption:
      'A single electronics purchase carries 85 kg of embedded carbon. Repairing or buying ' +
      'used avoids nearly all of it.',
  };

  const suggestion = suggestions[data.highestCategory?.category];
  if (suggestion) {
    paragraphs.push({ tone: 'good', text: suggestion });
  }

  return paragraphs;
}

const TONE_COLORS = {
  good: 'var(--eco-primary)',
  warning: 'var(--eco-orange)',
  neutral: 'var(--eco-text-muted)',
};

export default function Reports() {
  const { profile } = useAuth();
  const { prefersReducedMotion } = useTheme();

  const [reportType, setReportType] = useState('monthly');
  const [startDate, setStartDate] = useState(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState(new Date());

  const [report, setReport] = useState(null);
  const [generating, setGenerating] = useState(false);

  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [busyId, setBusyId] = useState(null);

  // --- AI summary (optional, only if the Gemini assistant is configured) ---
  // The rule-based summary below always shows. This is an extra, on-demand
  // written summary from the assistant, keyed to the currently open report.
  const [assistantOn, setAssistantOn] = useState(false);
  const [aiSummary, setAiSummary] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Ask once whether the assistant is available, so the button only appears
  // when a request would actually succeed
  useEffect(() => {
    let cancelled = false;
    assistantApi
      .getStatus()
      .then((s) => {
        if (!cancelled) setAssistantOn(Boolean(s?.available));
      })
      .catch(() => {
        if (!cancelled) setAssistantOn(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const generateAiSummary = async () => {
    if (!report || aiLoading) return;
    setAiLoading(true);
    try {
      const data = await assistantApi.summarise(report.periodStart, report.periodEnd);
      setAiSummary(data.summary);
    } catch (error) {
      toast.error(getErrorMessage(error, 'The assistant could not write a summary.'));
    } finally {
      setAiLoading(false);
    }
  };

  // The two preset periods fill the dates in for you. "Custom" is left alone
  // on purpose: switching to it keeps whatever dates are already showing, so
  // you can nudge one end without the range jumping back to a default. When a
  // date is edited directly (see handleStartChange below) the type flips to
  // custom, and this effect must NOT then reset it - hence the empty branch.
  useEffect(() => {
    const today = new Date();
    if (reportType === 'monthly') {
      setStartDate(startOfMonth(today));
      setEndDate(today);
    } else if (reportType === 'yearly') {
      setStartDate(startOfYear(today));
      setEndDate(today);
    }
    // reportType === 'custom' -> keep the current dates, change nothing
  }, [reportType]);

  // Editing either date is itself a choice to build a custom range, so the
  // Period dropdown follows along automatically. Without this, a manual date
  // change under a "This month" preset would be silently overwritten the next
  // time the preset effect ran.
  const handleStartChange = (nextDate) => {
    setStartDate(nextDate);
    if (reportType !== 'custom') setReportType('custom');
  };

  const handleEndChange = (nextDate) => {
    setEndDate(nextDate);
    if (reportType !== 'custom') setReportType('custom');
  };

  const loadHistory = async () => {
    try {
      const data = await reportsApi.getAll();
      setHistory(data.reports || []);
    } catch {
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const dateError = useMemo(() => {
    if (!startDate || !endDate) return 'Choose both dates.';
    if (endDate < startDate) return 'The end date cannot be before the start date.';
    if (startDate > new Date()) return 'The start date cannot be in the future.';
    return null;
  }, [startDate, endDate]);

  const handleGenerate = async () => {
    if (dateError || generating) return;

    setGenerating(true);
    try {
      const data = await reportsApi.generate({
        reportType,
        // The backend expects plain YYYY-MM-DD strings, not Date objects
        periodStart: formatDateFns(startDate, 'yyyy-MM-dd'),
        periodEnd: formatDateFns(endDate, 'yyyy-MM-dd'),
      });

      setReport(data);
      setAiSummary(null); // new report - drop any AI summary from the last one
      toast.success('Report generated.');
      loadHistory();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not generate that report.'));
    } finally {
      setGenerating(false);
    }
  };

  const handleOpen = async (reportId) => {
    setBusyId(reportId);
    try {
      // Opening recalculates from the current records, so an old report always
      // reflects the data as it stands now rather than a frozen snapshot
      const data = await reportsApi.getOne(reportId);
      setReport(data);
      setAiSummary(null); // new report - drop any AI summary from the last one
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not open that report.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (reportId) => {
    setBusyId(reportId);
    try {
      await reportsApi.remove(reportId);
      setHistory((current) => current.filter((item) => item.id !== reportId));
      if (report?.id === reportId) setReport(null);
      toast.success('Report deleted.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not delete that report.'));
    } finally {
      setBusyId(null);
    }
  };

  const narrative = useMemo(() => buildNarrative(report), [report]);

  // Categories that actually have emissions, sorted heaviest first
  const rankedCategories = useMemo(() => {
    if (!report?.data?.categoryBreakdown) return [];
    return Object.entries(report.data.categoryBreakdown)
      .filter(([, value]) => value > 0)
      .sort((a, b) => b[1] - a[1]);
  }, [report]);

  const maxCategoryValue = rankedCategories[0]?.[1] || 1;

  return (
    <div className="container" style={{ paddingTop: '2.5rem', paddingBottom: '3.5rem' }}>
      <PageBanner
        photo="reportsPath"
        alt="A winding road through a green forest"
        color="#0ea5e9"
        icon={FileText}
        eyebrow="Your summary"
        title="Carbon"
        titleAccent="Reports"
        subtitle="A written summary of any period, rebuilt from your records each time you open it."
      />

      {/* ============ CONTROLS ============ */}
      <div className="eco-card eco-no-print" style={{ marginBottom: '1.5rem' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            alignItems: 'start',
          }}
        >
          <SelectField
            id="report-type"
            label="Period"
            value={reportType}
            onChange={setReportType}
            options={REPORT_TYPES}
          />

          <div>
            <label
              className="eco-text-muted"
              style={{ fontSize: '0.72rem', fontWeight: 500, display: 'block', marginBottom: 6 }}
            >
              From
            </label>
            <DatePicker
              selected={startDate}
              onChange={handleStartChange}
              dateFormat="dd MMM yyyy"
              maxDate={new Date()}
              // showMonthDropdown / showYearDropdown add jump menus at the top
              // of the calendar, so picking a month a year back takes one click
              // instead of tapping the arrow twelve times
              showMonthDropdown
              showYearDropdown
              dropdownMode="select"
              className="form-control"
              wrapperClassName="eco-datepicker-wrap"
            />
          </div>

          <div>
            <label
              className="eco-text-muted"
              style={{ fontSize: '0.72rem', fontWeight: 500, display: 'block', marginBottom: 6 }}
            >
              To
            </label>
            <DatePicker
              selected={endDate}
              onChange={handleEndChange}
              dateFormat="dd MMM yyyy"
              minDate={startDate}
              maxDate={new Date()}
              showMonthDropdown
              showYearDropdown
              dropdownMode="select"
              className="form-control"
              wrapperClassName="eco-datepicker-wrap"
            />
          </div>

          <button
            type="button"
            className="eco-btn eco-btn-primary"
            onClick={handleGenerate}
            disabled={generating || !!dateError}
            style={{ alignSelf: 'end', minHeight: 46 }}
          >
            {generating ? (
              <>
                <Loader2 size={17} style={{ animation: 'eco-spin 0.8s linear infinite' }} />
                Generating…
              </>
            ) : (
              <>
                <FileText size={17} />
                Generate report
              </>
            )}
          </button>
        </div>

        {dateError && (
          <div className="eco-field-error" style={{ marginTop: '0.8rem' }}>
            <AlertCircle size={13} />
            {dateError}
          </div>
        )}
      </div>

      {/* ============ THE REPORT ============ */}
      <AnimatePresence mode="wait">
        {report && (
          <motion.div
            key={report.id}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? {} : { opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            id="eco-report-printable"
          >
            {/* --- header --- */}
            <div className="eco-card" style={{ marginBottom: '1.5rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: '1rem',
                }}
              >
                <div>
                  <h2 style={{ fontSize: '1.3rem', marginBottom: '0.3rem' }}>
                    Carbon report — {formatDate(report.periodStart)} to{' '}
                    {formatDate(report.periodEnd)}
                  </h2>
                  <p className="eco-text-muted" style={{ margin: 0, fontSize: '0.86rem' }}>
                    Prepared for {profile?.name} · {report.reportType} · generated{' '}
                    {formatDate(report.generatedAt)}
                  </p>
                </div>

                <button
                  type="button"
                  className="eco-btn eco-btn-ghost eco-no-print"
                  onClick={() => window.print()}
                >
                  <Printer size={16} />
                  Print / Save as PDF
                </button>
              </div>

              {/* headline figures */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: '1rem',
                  marginTop: '1.6rem',
                  paddingTop: '1.4rem',
                  borderTop: '1px solid var(--eco-border)',
                }}
              >
                {[
                  { label: 'Total emissions', value: formatEmission(report.data.totalEmission) },
                  { label: 'Daily average', value: formatEmission(report.data.dailyAverage) },
                  { label: 'Entries logged', value: formatNumber(report.data.recordCount, 0) },
                  { label: 'Days covered', value: formatNumber(report.data.daysInPeriod, 0) },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="eco-text-muted" style={{ fontSize: '0.74rem' }}>
                      {item.label}
                    </div>
                    <div
                      style={{
                        fontFamily: 'Space Grotesk, sans-serif',
                        fontWeight: 700,
                        fontSize: '1.2rem',
                        marginTop: '0.2rem',
                      }}
                    >
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* --- narrative summary --- */}
            <div className="eco-card" style={{ marginBottom: '1.5rem' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.55rem',
                  marginBottom: '1.2rem',
                }}
              >
                <Sparkles size={19} style={{ color: 'var(--eco-primary)' }} />
                <h3 style={{ fontSize: '1.08rem', margin: 0 }}>Summary</h3>
              </div>

              <div style={{ display: 'grid', gap: '1rem' }}>
                {narrative.map((paragraph, index) => (
                  <motion.p
                    key={paragraph.text.slice(0, 40)}
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: index * 0.09 }}
                    style={{
                      margin: 0,
                      paddingLeft: '0.9rem',
                      borderLeft: `2px solid ${TONE_COLORS[paragraph.tone]}`,
                      fontSize: '0.94rem',
                      lineHeight: 1.7,
                    }}
                  >
                    {paragraph.text}
                  </motion.p>
                ))}
              </div>

              {/* --- optional AI-written summary ---
                  The rule-based paragraphs above always show and are what the
                  report is built on. This is an extra: a written summary from
                  the Gemini assistant, generated only when asked and only when
                  the assistant is actually configured on the server. */}
              {assistantOn && (
                <div
                  className="eco-no-print"
                  style={{ marginTop: '1.5rem', paddingTop: '1.3rem', borderTop: '1px solid var(--eco-border)' }}
                >
                  {!aiSummary && !aiLoading && (
                    <button
                      type="button"
                      className="eco-btn eco-btn-outline"
                      onClick={generateAiSummary}
                      style={{ fontSize: '0.86rem' }}
                    >
                      <Sparkles size={16} />
                      Write an AI summary of this period
                    </button>
                  )}

                  {aiLoading && (
                    <div
                      className="eco-text-muted"
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem' }}
                    >
                      <Loader2 size={15} style={{ animation: 'eco-spin 0.9s linear infinite' }} />
                      The assistant is writing your summary…
                    </div>
                  )}

                  {aiSummary && (
                    <motion.div
                      initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      style={{
                        padding: '1.1rem 1.2rem',
                        borderRadius: 'var(--eco-radius-sm)',
                        background: 'rgba(var(--eco-primary-rgb), 0.05)',
                        border: '1px solid rgba(var(--eco-primary-rgb), 0.2)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                          marginBottom: '0.7rem',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          color: 'var(--eco-primary)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        <Sparkles size={13} />
                        AI summary
                      </div>
                      {/* whiteSpace preserves the paragraph breaks the model
                          returns, without needing a markdown renderer */}
                      <p style={{ margin: 0, fontSize: '0.92rem', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>
                        {aiSummary}
                      </p>
                    </motion.div>
                  )}
                </div>
              )}
            </div>

            {/* --- breakdown + impact --- */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
                gap: '1.5rem',
                marginBottom: '1.5rem',
              }}
            >
              <div className="eco-card">
                <h3 style={{ fontSize: '1.05rem', marginBottom: '1.3rem' }}>
                  Breakdown by category
                </h3>

                {rankedCategories.length === 0 ? (
                  <p className="eco-text-muted" style={{ fontSize: '0.9rem', margin: 0 }}>
                    No emissions recorded in this period.
                  </p>
                ) : (
                  <div style={{ display: 'grid', gap: '0.95rem' }}>
                    {rankedCategories.map(([category, value], index) => {
                      const share =
                        report.data.totalEmission > 0
                          ? (value / report.data.totalEmission) * 100
                          : 0;
                      const color = CATEGORY_META[category]?.color || '#8888aa';

                      return (
                        <div key={category}>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              fontSize: '0.86rem',
                              marginBottom: '0.35rem',
                            }}
                          >
                            <span>{formatCategory(category)}</span>
                            <span className="eco-text-muted">
                              {formatEmission(value)} · {formatNumber(share, 0)}%
                            </span>
                          </div>

                          <div
                            style={{
                              height: 8,
                              borderRadius: 8,
                              background: 'var(--eco-border)',
                              overflow: 'hidden',
                            }}
                          >
                            <motion.div
                              initial={prefersReducedMotion ? false : { width: 0 }}
                              animate={{ width: `${(value / maxCategoryValue) * 100}%` }}
                              transition={{ duration: 0.8, delay: 0.1 + index * 0.07 }}
                              style={{
                                height: '100%',
                                borderRadius: 8,
                                background: `linear-gradient(90deg, ${color}, ${color}88)`,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <ImpactEquivalents
                emissionKg={report.data.totalEmission}
                title="What this period cost"
                subtitle={`${formatEmission(report.data.totalEmission)} over ${
                  report.data.daysInPeriod
                } days`}
              />
            </div>

            {/* --- worst offenders --- */}
            {report.data.topSubTypes?.length > 0 && (
              <div className="eco-card" style={{ marginBottom: '1.5rem' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.55rem',
                    marginBottom: '1.2rem',
                  }}
                >
                  <TrendingUp size={18} style={{ color: 'var(--eco-orange)' }} />
                  <h3 style={{ fontSize: '1.05rem', margin: 0 }}>Biggest contributors</h3>
                </div>

                <div className="eco-table-wrap">
                  <table className="eco-table">
                    <thead>
                      <tr>
                        <th>Activity</th>
                        <th>Category</th>
                        <th>Times logged</th>
                        <th>Emissions</th>
                        <th>Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.data.topSubTypes.map((item) => {
                        const share =
                          report.data.totalEmission > 0
                            ? (item.emission / report.data.totalEmission) * 100
                            : 0;
                        return (
                          <tr key={`${item.category}-${item.subType}`}>
                            <td style={{ fontWeight: 500 }}>{formatSubType(item.subType)}</td>
                            <td className="eco-text-muted">{formatCategory(item.category)}</td>
                            <td className="eco-text-muted">{item.count}</td>
                            <td style={{ fontWeight: 600 }}>{formatEmission(item.emission)}</td>
                            <td className="eco-text-muted">{formatNumber(share, 0)}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ============ PAST REPORTS ============ */}
      <div className="eco-card eco-no-print">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.55rem',
            marginBottom: '1.1rem',
          }}
        >
          <CalendarRange size={18} style={{ color: 'var(--eco-text-muted)' }} />
          <h3 style={{ fontSize: '1.05rem', margin: 0 }}>Previously generated</h3>
        </div>

        {loadingHistory ? (
          <div style={{ display: 'grid', gap: '0.6rem' }}>
            {[0, 1].map((index) => (
              <div
                key={index}
                className="eco-skeleton"
                style={{ height: 44, borderRadius: 'var(--eco-radius-sm)' }}
              />
            ))}
          </div>
        ) : history.length === 0 ? (
          <p className="eco-text-muted" style={{ fontSize: '0.9rem', margin: 0 }}>
            No reports yet. Generate one above and it will be saved here.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: '0.6rem' }}>
            {history.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.8rem',
                  padding: '0.75rem 0.9rem',
                  borderRadius: 'var(--eco-radius-sm)',
                  border: '1px solid var(--eco-border)',
                  flexWrap: 'wrap',
                }}
              >
                <FileText size={17} style={{ color: 'var(--eco-text-muted)', flexShrink: 0 }} />

                <div style={{ flex: 1, minWidth: 150 }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                    {formatDate(item.periodStart)} — {formatDate(item.periodEnd)}
                  </div>
                  <div className="eco-text-muted" style={{ fontSize: '0.78rem' }}>
                    {item.reportType} · generated {formatDate(item.generatedAt)}
                  </div>
                </div>

                <button
                  type="button"
                  className="eco-btn eco-btn-ghost"
                  style={{ padding: '0.4rem 0.85rem', fontSize: '0.82rem' }}
                  onClick={() => handleOpen(item.id)}
                  disabled={busyId === item.id}
                >
                  {busyId === item.id ? (
                    <Loader2 size={14} style={{ animation: 'eco-spin 0.8s linear infinite' }} />
                  ) : (
                    'Open'
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  disabled={busyId === item.id}
                  aria-label="Delete report"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--eco-text-muted)',
                    cursor: 'pointer',
                    padding: 6,
                    display: 'flex',
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
