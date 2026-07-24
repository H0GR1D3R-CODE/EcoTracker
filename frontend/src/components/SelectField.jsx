// EcoTrack/frontend/src/components/SelectField.jsx
//
// NOTE: another addition to the folder structure in the project plan, for a
// reason worth writing down.
//
// WHY NOT JUST USE <select>
// A native <select> renders its open list using the operating system, not the
// page. Chrome on Windows draws a plain white popup with system-coloured text,
// and CSS cannot reach inside it - which on a dark theme means near-invisible
// text. That is not a styling oversight, it is a deliberate browser boundary.
//
// The only way to control that list is to stop using the native popup and build
// one, which is what this is. It keeps the behaviour people expect from a
// dropdown - keyboard navigation, click-outside-to-close, Escape to cancel -
// while being an ordinary styled div that obeys the theme.
//
// Accessibility is handled with the ARIA combobox pattern, so screen readers
// still announce it as a dropdown even though it is built from divs.

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';

import { useTheme } from '../context/ThemeContext';

/**
 * @param {string} id
 * @param {string} label            floating label text
 * @param {string} value            currently selected value
 * @param {Function} onChange       called with the new value
 * @param {Array} options           [{ value, label, hint }]
 * @param {boolean} disabled
 * @param {string} error            error message, shown by the caller
 * @param {string} placeholder      shown when nothing is selected
 */
export default function SelectField({
  id,
  label,
  value,
  onChange,
  options = [],
  disabled = false,
  error = null,
  placeholder = 'Select an option',
}) {
  const { prefersReducedMotion } = useTheme();

  const [open, setOpen] = useState(false);
  // Which option the keyboard is currently sitting on - separate from which
  // one is actually selected, because arrowing through a list should not
  // change the value until Enter is pressed
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef(null);
  const listRef = useRef(null);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;

  // --- close when the user clicks anywhere else on the page ---
  useEffect(() => {
    if (!open) return undefined;

    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    // "mousedown" rather than "click" so the list closes on press, before the
    // click has a chance to land on whatever is underneath
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // --- when the list opens, start the highlight on the current selection ---
  useEffect(() => {
    if (open) setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, selectedIndex]);

  // --- keep the highlighted option scrolled into view ---
  useEffect(() => {
    if (!open || highlightedIndex < 0 || !listRef.current) return;

    const optionElement = listRef.current.children[highlightedIndex];
    // "nearest" scrolls the minimum distance needed, so the list does not jump
    // around when the highlighted item is already visible
    if (optionElement) optionElement.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex, open]);

  const selectOption = (option) => {
    onChange(option.value);
    setOpen(false);
  };

  const handleKeyDown = (event) => {
    if (disabled) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault(); // stop the page scrolling behind the list
        if (!open) {
          setOpen(true);
        } else {
          // Math.min stops the highlight running off the end of the list
          setHighlightedIndex((current) => Math.min(current + 1, options.length - 1));
        }
        break;

      case 'ArrowUp':
        event.preventDefault();
        if (open) setHighlightedIndex((current) => Math.max(current - 1, 0));
        break;

      case 'Enter':
      case ' ':
        event.preventDefault();
        if (open && options[highlightedIndex]) {
          selectOption(options[highlightedIndex]);
        } else {
          setOpen(true);
        }
        break;

      case 'Escape':
        setOpen(false);
        break;

      case 'Home':
        if (open) {
          event.preventDefault();
          setHighlightedIndex(0);
        }
        break;

      case 'End':
        if (open) {
          event.preventDefault();
          setHighlightedIndex(options.length - 1);
        }
        break;

      default:
        break;
    }
  };

  const borderColour = error
    ? 'var(--eco-danger)'
    : open
      ? 'var(--eco-primary)'
      : 'var(--eco-border)';

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* ---------- the trigger ---------- */}
      <button
        type="button"
        id={id}
        onClick={() => !disabled && setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        // The ARIA attributes are what tell a screen reader this div behaves
        // like a dropdown, since it is not a real <select>
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-labelledby={`${id}-label`}
        style={{
          width: '100%',
          textAlign: 'left',
          background: open
            ? 'rgba(var(--eco-primary-rgb), 0.06)'
            : 'rgba(var(--eco-primary-rgb), 0.03)',
          border: `1px solid ${borderColour}`,
          borderRadius: 'var(--eco-radius-sm)',
          color: 'var(--eco-text)',
          // Extra top padding leaves room for the floating label above the value
          padding: '1.55rem 2.6rem 0.6rem 0.9rem',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.55 : 1,
          minHeight: 62,
          position: 'relative',
          transition: 'border-color 0.25s ease, background-color 0.25s ease, box-shadow 0.25s ease',
          boxShadow: open ? '0 0 0 3px rgba(var(--eco-primary-rgb), 0.15)' : 'none',
        }}
      >
        {/* Floating label, pinned to the top of the control */}
        <span
          id={`${id}-label`}
          style={{
            position: 'absolute',
            top: '0.5rem',
            left: '0.9rem',
            fontSize: '0.72rem',
            fontWeight: 500,
            color: open ? 'var(--eco-primary)' : 'var(--eco-text-muted)',
            transition: 'color 0.25s ease',
            pointerEvents: 'none',
          }}
        >
          {label}
        </span>

        <span
          style={{
            display: 'block',
            fontSize: '0.95rem',
            // Long option text is cut off rather than wrapping and making the
            // control taller than everything next to it
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: selectedOption ? 'var(--eco-text)' : 'var(--eco-text-muted)',
          }}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>

        {/* The chevron rotates to point up while the list is open */}
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.25 }}
          style={{
            position: 'absolute',
            right: '0.9rem',
            top: '50%',
            marginTop: -9,
            display: 'flex',
            color: open ? 'var(--eco-primary)' : 'var(--eco-text-muted)',
            pointerEvents: 'none',
          }}
        >
          <ChevronDown size={18} />
        </motion.span>
      </button>

      {/* ---------- the list ---------- */}
      <AnimatePresence>
        {open && (
          <motion.ul
            ref={listRef}
            role="listbox"
            aria-labelledby={`${id}-label`}
            initial={prefersReducedMotion ? false : { opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={prefersReducedMotion ? {} : { opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: 0,
              right: 0,
              // Above the page, but below the navbar (which is 1030)
              zIndex: 1000,
              margin: 0,
              padding: '0.35rem',
              listStyle: 'none',
              background: 'var(--eco-card)',
              border: '1px solid var(--eco-glass-border)',
              borderRadius: 'var(--eco-radius-sm)',
              boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
              // A long list scrolls inside itself rather than running off the page
              maxHeight: 280,
              overflowY: 'auto',
            }}
          >
            {options.length === 0 && (
              <li
                className="eco-text-muted"
                style={{ padding: '0.7rem 0.8rem', fontSize: '0.88rem' }}
              >
                No options available
              </li>
            )}

            {options.map((option, index) => {
              const isSelected = option.value === value;
              const isHighlighted = index === highlightedIndex;

              return (
                <li
                  key={option.value}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => selectOption(option)}
                  // Moving the highlight on hover keeps mouse and keyboard in
                  // step, so the two never disagree about the active row
                  onMouseEnter={() => setHighlightedIndex(index)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    padding: '0.62rem 0.7rem',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: isHighlighted
                      ? 'rgba(var(--eco-primary-rgb), 0.12)'
                      : 'transparent',
                    color: isSelected ? 'var(--eco-primary)' : 'var(--eco-text)',
                    transition: 'background-color 0.15s ease',
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: 'block',
                        fontSize: '0.9rem',
                        fontWeight: isSelected ? 600 : 400,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {option.label}
                    </span>

                    {/* Secondary line - the Calculator uses this for the factor */}
                    {option.hint && (
                      <span
                        className="eco-text-muted"
                        style={{ display: 'block', fontSize: '0.75rem', marginTop: 1 }}
                      >
                        {option.hint}
                      </span>
                    )}
                  </span>

                  {isSelected && (
                    <Check size={15} style={{ color: 'var(--eco-primary)', flexShrink: 0 }} />
                  )}
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
