// EcoTrack/frontend/src/pages/ActivityLog.jsx
// Every activity this account has ever logged, not just the Calculator's
// own most-recent-10 list - filterable by category and date range, with a
// real edit (not just delete-and-relog) added alongside the delete that
// already existed. See backend/routes/carbon.py's list_all_records and
// update_record for why pagination happens in Python rather than Firestore.

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Loader2,
  Pencil,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';

import { carbonApi, factorsApi, getErrorMessage } from '../utils/api';
import { useTheme } from '../context/ThemeContext';
import PageBanner from '../components/PageBanner';
import SelectField from '../components/SelectField';
import SkeletonCard from '../components/SkeletonCard';
import { CATEGORY_META, CATEGORY_ORDER, validateQuantity, validateRecordDate } from '../utils/emissionHelpers';
import { formatCategory, formatDate, formatEmission, formatSubType } from '../utils/formatters';

const PAGE_SIZE = 25;

const CATEGORY_FILTER_OPTIONS = [
  { value: '', label: 'All categories' },
  ...CATEGORY_ORDER.map((category) => ({ value: category, label: formatCategory(category) })),
];

function EditModal({ record, subTypeOptions, onClose, onSaved }) {
  const { prefersReducedMotion } = useTheme();
  const [subType, setSubType] = useState(record.subType);
  const [quantity, setQuantity] = useState(String(record.quantity));
  const [recordedDate, setRecordedDate] = useState(record.recordedDate);
  const [touched, setTouched] = useState({});
  const [saving, setSaving] = useState(false);

  const errors = {
    quantity: validateQuantity(quantity),
    recordedDate: validateRecordDate(recordedDate),
  };
  const isValid = !errors.quantity && !errors.recordedDate;

  const handleSave = async () => {
    setTouched({ quantity: true, recordedDate: true });
    if (!isValid || saving) return;

    setSaving(true);
    try {
      const result = await carbonApi.updateRecord(record.id, {
        subType,
        quantity: Number(quantity),
        recordedDate,
      });
      toast.success('Entry updated.');
      onSaved(result.record);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not update this entry.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1050,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        background: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      {/* Enter-only, no AnimatePresence/exit - the same class of bug fixed
          everywhere else in this app that used to depend on an exit
          animation completing before the next thing could render. */}
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="eco-card"
        style={{ width: '100%', maxWidth: 440 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.3rem' }}>
          <div>
            <span className="eco-marker" style={{ display: 'block', marginBottom: '0.3rem' }}>
              {formatCategory(record.category)}
            </span>
            <h3 className="eco-display" style={{ fontSize: '1.1rem', margin: 0 }}>Edit entry</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'transparent', border: 'none', color: 'var(--eco-text-muted)', cursor: 'pointer', padding: 6 }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'grid', gap: '1rem' }}>
          <SelectField
            id="edit-subtype"
            label="Type"
            value={subType}
            onChange={setSubType}
            options={subTypeOptions}
          />

          <div>
            <div className="form-floating">
              <input
                type="number"
                id="edit-quantity"
                className={`form-control ${touched.quantity && errors.quantity ? 'is-invalid' : ''}`}
                placeholder="Quantity"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                onBlur={() => setTouched((prev) => ({ ...prev, quantity: true }))}
                min="0"
                step="any"
              />
              <label htmlFor="edit-quantity">Quantity ({record.unit})</label>
            </div>
            {touched.quantity && errors.quantity && (
              <div className="eco-field-error">
                <AlertCircle size={13} />
                {errors.quantity}
              </div>
            )}
          </div>

          <div>
            <div className="form-floating">
              <input
                type="date"
                id="edit-date"
                className={`form-control ${touched.recordedDate && errors.recordedDate ? 'is-invalid' : ''}`}
                value={recordedDate}
                onChange={(event) => setRecordedDate(event.target.value)}
                onBlur={() => setTouched((prev) => ({ ...prev, recordedDate: true }))}
                max={new Date().toISOString().slice(0, 10)}
              />
              <label htmlFor="edit-date">Date</label>
            </div>
            {touched.recordedDate && errors.recordedDate && (
              <div className="eco-field-error">
                <AlertCircle size={13} />
                {errors.recordedDate}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.7rem', marginTop: '1.4rem' }}>
          <button type="button" onClick={onClose} className="eco-btn eco-btn-ghost" style={{ flex: 1 }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="eco-btn eco-btn-primary"
            style={{ flex: 1 }}
          >
            {saving ? <Loader2 size={16} style={{ animation: 'eco-spin 0.8s linear infinite' }} /> : 'Save'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function ImportModal({ onClose, onImported }) {
  const { prefersReducedMotion } = useTheme();
  const [fileName, setFileName] = useState('');
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);

    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result || ''));
    reader.onerror = () => toast.error('Could not read that file.');
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!csvText || importing) return;
    setImporting(true);
    try {
      const data = await carbonApi.importRecords(csvText);
      setResult(data);
      if (data.importedCount > 0) onImported();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not import that file.'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1050,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        background: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="eco-card"
        style={{ width: '100%', maxWidth: 480 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.1rem' }}>
          <h3 className="eco-display" style={{ fontSize: '1.1rem', margin: 0 }}>Import from CSV</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'transparent', border: 'none', color: 'var(--eco-text-muted)', cursor: 'pointer', padding: 6 }}
          >
            <X size={18} />
          </button>
        </div>

        {!result && (
          <>
            <p className="eco-text-muted" style={{ fontSize: '0.86rem', lineHeight: 1.6, marginBottom: '1.2rem' }}>
              Columns: <code style={{ fontFamily: 'var(--font-mono)' }}>Date, Category, Sub-type, Quantity, Unit</code> - the
              same format this page's own CSV export uses, so a previous export is a ready-made template. Every row is
              recalculated from the published factor, same as a manual entry - nothing here is trusted as-is.
            </p>

            <label
              className="eco-btn eco-btn-outline"
              style={{ width: '100%', justifyContent: 'center', cursor: 'pointer' }}
            >
              <Upload size={15} />
              {fileName || 'Choose a CSV file'}
              <input type="file" accept=".csv,text/csv" onChange={handleFileChange} style={{ display: 'none' }} />
            </label>

            <div style={{ display: 'flex', gap: '0.7rem', marginTop: '1.4rem' }}>
              <button type="button" onClick={onClose} className="eco-btn eco-btn-ghost" style={{ flex: 1 }}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={!csvText || importing}
                className="eco-btn eco-btn-primary"
                style={{ flex: 1 }}
              >
                {importing ? <Loader2 size={16} style={{ animation: 'eco-spin 0.8s linear infinite' }} /> : 'Import'}
              </button>
            </div>
          </>
        )}

        {result && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
              <CheckCircle2 size={18} style={{ color: 'var(--eco-primary)', flexShrink: 0 }} />
              <p style={{ margin: 0, fontSize: '0.92rem' }}>
                Imported <strong>{result.importedCount}</strong> {result.importedCount === 1 ? 'entry' : 'entries'}
                {result.errorCount > 0 && `, ${result.errorCount} row${result.errorCount === 1 ? '' : 's'} skipped`}.
              </p>
            </div>

            {result.errors?.length > 0 && (
              <div
                style={{
                  maxHeight: 180,
                  overflowY: 'auto',
                  background: 'var(--eco-bg-alt)',
                  border: '1px solid var(--eco-border)',
                  borderRadius: 'var(--eco-radius-sm)',
                  padding: '0.8rem 1rem',
                  marginBottom: '1.2rem',
                }}
              >
                {result.errors.map((err) => (
                  <div key={err.row} className="eco-text-muted" style={{ fontSize: '0.8rem', marginBottom: '0.4rem' }}>
                    Row {err.row}: {err.message}
                  </div>
                ))}
              </div>
            )}

            <button type="button" onClick={onClose} className="eco-btn eco-btn-primary" style={{ width: '100%' }}>
              Done
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export default function ActivityLog() {
  const { prefersReducedMotion } = useTheme();

  const [category, setCategory] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [factors, setFactors] = useState(null);
  const [editingRecord, setEditingRecord] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);

  // Keyed by record id - a pending delete's real DELETE call, delayed by
  // UNDO_WINDOW_MS, so the toast's "Undo" button can cancel it before it
  // ever reaches the server. A ref rather than state: a timer id is not
  // something a re-render should ever reset or duplicate.
  const pendingDeletesRef = useRef({});

  useEffect(() => {
    factorsApi.getAll().then(setFactors).catch(() => {});
  }, []);

  const load = () => {
    setLoading(true);
    setError(null);
    const params = { page, pageSize: PAGE_SIZE };
    if (category) params.category = category;
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;

    carbonApi
      .getAllRecords(params)
      .then(setData)
      .catch((err) => setError(getErrorMessage(err, 'Could not load your activity log.')))
      .finally(() => setLoading(false));
  };

  useEffect(load, [category, startDate, endDate, page]);

  // Changing a filter with an existing page 3 open should not silently keep
  // showing "page 3 of whatever the new filter has" - it resets to page 1
  // the moment any filter changes.
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, startDate, endDate]);

  const UNDO_WINDOW_MS = 5000;

  const handleDelete = (record) => {
    // Optimistic: gone from the list the instant you click, not after a
    // network round trip - the same "feels instant" reasoning
    // Calculator.jsx's own delete button already uses. The record is not
    // actually gone server-side yet - the real DELETE call is what the
    // timer below fires, unless "Undo" cancels it first.
    setData((current) =>
      current && {
        ...current,
        records: current.records.filter((r) => r.id !== record.id),
        totalCount: Math.max(0, current.totalCount - 1),
      }
    );

    const timeoutId = setTimeout(async () => {
      delete pendingDeletesRef.current[record.id];
      try {
        await carbonApi.deleteRecord(record.id);
      } catch (err) {
        toast.error(getErrorMessage(err, 'Could not delete this entry.'));
        load(); // the optimistic removal above turned out to be wrong - resync with the server
      }
    }, UNDO_WINDOW_MS);

    pendingDeletesRef.current[record.id] = timeoutId;

    toast(
      (t) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
          <span>Entry deleted.</span>
          <button
            type="button"
            onClick={() => {
              clearTimeout(pendingDeletesRef.current[record.id]);
              delete pendingDeletesRef.current[record.id];
              toast.dismiss(t.id);
              load(); // never actually deleted server-side - reload brings it straight back
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              background: 'transparent',
              border: 'none',
              color: 'var(--eco-primary)',
              fontWeight: 600,
              cursor: 'pointer',
              padding: 0,
              fontSize: 'inherit',
              flexShrink: 0,
            }}
          >
            <Undo2 size={14} /> Undo
          </button>
        </div>
      ),
      { duration: UNDO_WINDOW_MS }
    );
  };

  const handleSaved = () => {
    setEditingRecord(null);
    load();
  };

  const subTypeOptionsFor = (recordCategory) => {
    const options = factors?.factors?.[recordCategory] || [];
    return options.map((factor) => ({
      value: factor.subType,
      label: formatSubType(factor.subType),
      hint: `${factor.factorValue} kg CO₂/${factor.unit}`,
    }));
  };

  return (
    <div className="container" style={{ paddingTop: '2.5rem', paddingBottom: '3.5rem' }}>
      <PageBanner
        photo="calcNature"
        alt="Sunlight through a green forest canopy"
        color="var(--eco-primary)"
        icon={ClipboardList}
        eyebrow="Your full history"
        title="Activity"
        titleAccent="Log"
        subtitle="Every entry you've ever logged, searchable and editable - not just the most recent ones."
        action={
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            className="eco-btn eco-btn-outline"
          >
            <Upload size={15} />
            Import CSV
          </button>
        }
      />

      {/* --- filters --- */}
      <div
        className="eco-card"
        style={{
          marginBottom: '1.8rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
        }}
      >
        <SelectField
          id="log-category-filter"
          label="Category"
          value={category}
          onChange={setCategory}
          options={CATEGORY_FILTER_OPTIONS}
        />
        <div>
          <div className="form-floating">
            <input
              type="date"
              id="log-start-date"
              className="form-control"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              max={endDate || undefined}
            />
            <label htmlFor="log-start-date">From</label>
          </div>
        </div>
        <div>
          <div className="form-floating">
            <input
              type="date"
              id="log-end-date"
              className="form-control"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              min={startDate || undefined}
              max={new Date().toISOString().slice(0, 10)}
            />
            <label htmlFor="log-end-date">To</label>
          </div>
        </div>
      </div>

      {error && (
        <p className="eco-text-muted" style={{ fontSize: '0.9rem' }}>
          {error}
        </p>
      )}

      {loading && !data && <SkeletonCard lines={5} height={400} />}

      {data && (
        <>
          {data.records.length === 0 ? (
            <div className="eco-card">
              <p className="eco-text-muted" style={{ margin: 0, fontSize: '0.9rem' }}>
                No entries match these filters.
              </p>
            </div>
          ) : (
            <div className="eco-table-wrap">
              <table className="eco-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Type</th>
                    <th>Quantity</th>
                    <th>Emissions</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {data.records.map((record) => {
                    const meta = CATEGORY_META[record.category];
                    return (
                      <tr key={record.id}>
                        <td className="eco-text-muted">{formatDate(record.recordedDate)}</td>
                        <td style={{ color: meta?.color }}>{formatCategory(record.category)}</td>
                        <td>{formatSubType(record.subType)}</td>
                        <td className="eco-text-muted">
                          {record.quantity} {record.unit}
                        </td>
                        <td className="eco-readout" style={{ fontWeight: 500 }}>
                          {formatEmission(record.emissionKgco2)}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              onClick={() => setEditingRecord(record)}
                              aria-label="Edit entry"
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--eco-text-muted)',
                                cursor: 'pointer',
                                padding: 8,
                                display: 'flex',
                              }}
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(record)}
                              aria-label="Delete entry"
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--eco-text-muted)',
                                cursor: 'pointer',
                                padding: 8,
                                display: 'flex',
                              }}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {data.totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginTop: '1.6rem' }}>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="eco-btn eco-btn-ghost"
                style={{ padding: '0.5rem 0.8rem' }}
              >
                <ChevronLeft size={16} />
              </button>
              <span className="eco-marker">
                Page {data.page} of {data.totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={page >= data.totalPages}
                className="eco-btn eco-btn-ghost"
                style={{ padding: '0.5rem 0.8rem' }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      )}

      {editingRecord && (
        <EditModal
          record={editingRecord}
          subTypeOptions={subTypeOptionsFor(editingRecord.category)}
          onClose={() => setEditingRecord(null)}
          onSaved={handleSaved}
        />
      )}

      {showImportModal && (
        <ImportModal
          onClose={() => setShowImportModal(false)}
          onImported={load}
        />
      )}
    </div>
  );
}
