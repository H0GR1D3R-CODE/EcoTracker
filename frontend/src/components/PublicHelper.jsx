// EcoTrack/frontend/src/components/PublicHelper.jsx
//
// The "EcoTrack Guide" shown to SIGNED-OUT visitors on the public pages.
//
// Used to be pure keyword matching against a fixed topic list - no login, no
// API key, no per-request cost. Now calls the same Gemini model the signed-in
// Assistant does, through a separate PUBLIC route (POST /api/assistant/
// public-chat) that needs no token, since there is no account here to hold
// one - see that route's own comment in backend/routes/assistant.py for how
// it is rate-limited instead. A visitor can now ask literally anything, the
// same as a signed-in user can, just without anything personal to read.
//
// Which helper a person sees is decided in App.jsx: this one for logged-out
// visitors, the real signed-in Assistant for logged-in users. Only ever one
// at a time.

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, Bot, HelpCircle, Loader2, Send, Sparkles, User, X } from 'lucide-react';

import { assistantApi, getErrorMessage } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { executeRecaptcha } from '../utils/recaptcha';
import ChatMarkdown from './ChatMarkdown';

// Shown before any question is asked - still useful as quick prompts even
// though a typed question is no longer limited to matching one of these.
const OPENERS = [
  'What is EcoTrack?',
  'How do I get started?',
  'How are emissions calculated?',
  'Is it free?',
  'How do I donate?',
];

export default function PublicHelper() {
  const { user, loading: authLoading } = useAuth();
  const { prefersReducedMotion } = useTheme();

  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Ask once whether the model is actually configured server-side. If not,
  // the button never appears - same reasoning as the signed-in Assistant.
  useEffect(() => {
    if (user) return; // this widget is for signed-out visitors only
    let cancelled = false;
    assistantApi
      .getPublicStatus()
      .then((status) => {
        if (!cancelled) setAvailable(Boolean(status?.available));
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const send = async (text) => {
    const question = (text ?? input).trim();
    if (!question || sending) return;

    setInput('');
    setError(null);

    const nextMessages = [...messages, { role: 'user', content: question }];
    setMessages(nextMessages);
    setSending(true);

    try {
      // Not configured (VITE_RECAPTCHA_SITE_KEY unset) resolves to null
      // rather than throwing - the backend treats a missing token the same
      // way, so this works identically whether or not reCAPTCHA is turned on.
      const recaptchaToken = await executeRecaptcha('public_assistant');
      const data = await assistantApi.publicChat(question, messages, recaptchaToken);
      setMessages([...nextMessages, { role: 'assistant', content: data.reply }]);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Could not answer that one.'));
      // Drop the unanswered question so the conversation does not end on a
      // user turn with no reply
      setMessages(messages);
      setInput(question);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  // Only for signed-out visitors, and only once the server confirms the
  // model is actually usable. While auth is still resolving, render nothing
  // so the button does not flash in and back out.
  if (authLoading || user || !available) return null;

  return (
    <>
      {/* ---------- floating button ---------- */}
      <motion.button
        type="button"
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-label={open ? 'Close the guide' : 'Open the guide'}
        initial={prefersReducedMotion ? false : { scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.7, ease: [0.22, 1, 0.36, 1] }}
        whileHover={prefersReducedMotion ? {} : { scale: 1.06 }}
        whileTap={prefersReducedMotion ? {} : { scale: 0.94 }}
        className="eco-assistant-fab"
      >
        {/* A plain keyed motion.span, not AnimatePresence mode="wait" -
            that combination is genuinely broken here (same class of bug
            fixed across Register.jsx, Login.jsx, Assistant.jsx and
            others): the SECOND open/close toggle in a session would leave
            the wrong icon on the launcher button, since the exit rotation
            this depended on never reports complete. */}
        <motion.span
          key={open ? 'close' : 'open'}
          initial={{ rotate: -90, opacity: 0 }}
          animate={{ rotate: 0, opacity: 1 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.22 }}
          style={{ display: 'flex' }}
        >
          {open ? <X size={22} /> : <HelpCircle size={22} />}
        </motion.span>
      </motion.button>

      {/* ---------- panel ---------- */}
      {/* A plain conditional, not AnimatePresence - genuinely broken here
          (same class of bug fixed across BillScanner.jsx, GrowingTree.jsx
          and this file's own launcher icon above): closing then reopening
          the panel a second time risks a stale, invisible-but-still-
          mounted copy, or the panel simply failing to close visibly. */}
        {open && (
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            className="eco-card eco-glass eco-assistant-panel"
          >
            {/* header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.7rem',
                paddingBottom: '0.9rem',
                borderBottom: '1px solid var(--eco-border)',
              }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--eco-primary)',
                  color: 'var(--eco-bg)',
                  flexShrink: 0,
                }}
              >
                <Sparkles size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>EcoTrack Guide</div>
                <div className="eco-text-muted" style={{ fontSize: '0.74rem' }}>
                  Ask anything - no account needed
                </div>
              </div>

              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setMessages([]);
                    setError(null);
                  }}
                  className="eco-text-muted"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.76rem',
                    padding: '0.2rem 0.4rem',
                  }}
                >
                  Clear
                </button>
              )}
            </div>

            {/* messages */}
            <div
              ref={scrollRef}
              style={{
                flex: 1,
                overflowY: 'auto',
                // Prevents an iOS scroll-chain into the page behind this
                // fixed panel when the conversation is dragged past its ends.
                overscrollBehavior: 'contain',
                padding: '1rem 0',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.85rem',
              }}
            >
              {messages.length === 0 && !sending && (
                <div>
                  <p style={{ fontSize: '0.92rem', marginBottom: '0.3rem' }}>
                    Hi! I can show you around EcoTrack - or help with anything else.
                  </p>
                  <p className="eco-text-muted" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
                    Pick a question, or type your own.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    {OPENERS.map((question) => (
                      <button
                        key={question}
                        type="button"
                        onClick={() => send(question)}
                        className="eco-assistant-starter-btn"
                        style={{
                          textAlign: 'left',
                          padding: '0.6rem 0.75rem',
                          borderRadius: 'var(--eco-radius-sm)',
                          border: '1px solid var(--eco-border)',
                          background: 'transparent',
                          color: 'var(--eco-text)',
                          fontSize: '0.84rem',
                          cursor: 'pointer',
                          transition: 'border-color 0.2s ease, background-color 0.2s ease',
                        }}
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((message, index) => {
                const isUser = message.role === 'user';
                return (
                  <motion.div
                    key={`${index}-${message.content.slice(0, 20)}`}
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    style={{
                      display: 'flex',
                      gap: '0.6rem',
                      flexDirection: isUser ? 'row-reverse' : 'row',
                    }}
                  >
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        background: isUser
                          ? 'var(--eco-border)'
                          : 'rgba(var(--eco-primary-rgb), 0.15)',
                        color: isUser ? 'var(--eco-text-muted)' : 'var(--eco-primary)',
                      }}
                    >
                      {isUser ? <User size={14} /> : <Bot size={14} />}
                    </div>

                    <div
                      style={{
                        maxWidth: isUser ? '80%' : '92%',
                        minWidth: 0,
                        padding: '0.65rem 0.85rem',
                        borderRadius: 'var(--eco-radius-sm)',
                        background: isUser
                          ? 'rgba(var(--eco-primary-rgb), 0.1)'
                          : 'var(--eco-bg-alt)',
                        fontSize: '0.87rem',
                        lineHeight: 1.6,
                        wordBreak: 'break-word',
                      }}
                    >
                      <ChatMarkdown role={message.role} content={message.content} />
                    </div>
                  </motion.div>
                );
              })}

              {sending && (
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 8,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'rgba(var(--eco-primary-rgb), 0.15)',
                      color: 'var(--eco-primary)',
                      flexShrink: 0,
                    }}
                  >
                    <Bot size={14} />
                  </div>
                  <span
                    className="eco-text-muted"
                    style={{ fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                  >
                    <Loader2 size={13} style={{ animation: 'eco-spin 0.9s linear infinite' }} />
                    Thinking…
                  </span>
                </div>
              )}

              {error && (
                <div
                  className="eco-field-error"
                  style={{ alignItems: 'flex-start', fontSize: '0.82rem' }}
                >
                  <AlertCircle size={13} style={{ marginTop: 2, flexShrink: 0 }} />
                  {error}
                </div>
              )}
            </div>

            {/* input */}
            <div
              style={{
                paddingTop: '0.85rem',
                borderTop: '1px solid var(--eco-border)',
                display: 'flex',
                gap: '0.5rem',
                alignItems: 'flex-end',
              }}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about EcoTrack, or anything else…"
                rows={1}
                disabled={sending}
                style={{
                  flex: 1,
                  resize: 'none',
                  maxHeight: 96,
                  padding: '0.6rem 0.75rem',
                  borderRadius: 'var(--eco-radius-sm)',
                  border: '1px solid var(--eco-border)',
                  background: 'rgba(var(--eco-primary-rgb), 0.04)',
                  color: 'var(--eco-text)',
                  // 1rem, not 0.87rem: iOS Safari force-zooms the page on
                  // focus for any text input under 16px.
                  fontSize: '1rem',
                  fontFamily: 'inherit',
                  lineHeight: 1.5,
                  outline: 'none',
                }}
                onFocus={(event) => {
                  event.currentTarget.style.borderColor = 'var(--eco-primary)';
                }}
                onBlur={(event) => {
                  event.currentTarget.style.borderColor = 'var(--eco-border)';
                }}
              />
              <button
                type="button"
                onClick={() => send()}
                disabled={sending || !input.trim()}
                aria-label="Send"
                className="eco-btn eco-btn-primary"
                style={{ padding: '0.6rem 0.8rem', minHeight: 40 }}
              >
                {sending ? (
                  <Loader2 size={16} style={{ animation: 'eco-spin 0.8s linear infinite' }} />
                ) : (
                  <Send size={16} />
                )}
              </button>
            </div>
          </motion.div>
        )}
    </>
  );
}
