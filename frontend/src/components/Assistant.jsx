// EcoTrack/frontend/src/components/Assistant.jsx
//
// NOTE: an addition to the folder structure in the project plan, added when
// the assistant feature was approved.
//
// The floating EcoTrack Assistant - a chat panel that answers questions about
// the signed-in user's own footprint.
//
// WHERE THE INTELLIGENCE LIVES
// Not here. This component is a chat UI and nothing more: it collects a
// question, posts it to POST /api/assistant/chat, and renders the reply. The
// Anthropic API key is held only by the Flask server, which reads the user's
// real Firestore data and puts it in the prompt before calling Claude.
//
// That split is deliberate. If the browser called Anthropic directly, the API
// key would be sitting in the JavaScript bundle for anyone to take.
//
// The conversation lives in this component's state and is passed back to the
// server on each turn, because the Claude API is stateless - it has no memory
// of previous requests.

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Bot, Loader2, Send, Sparkles, User, X } from 'lucide-react';

import { assistantApi, getErrorMessage } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

// Shown when the conversation is empty, to give people a way in
const STARTER_QUESTIONS = [
  'What is my biggest source of emissions?',
  'How am I doing against last month?',
  'How do I set a goal?',
  'What is one change that would help most?',
];

export default function Assistant() {
  const { user, profile } = useAuth();
  const { prefersReducedMotion } = useTheme();

  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Ask the server once whether the assistant is configured. If there is no
  // API key, the button never appears - better than showing a feature that
  // fails the moment someone clicks it.
  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    assistantApi
      .getStatus()
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

  // Keep the newest message in view as the conversation grows
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  // Put the cursor in the box when the panel opens
  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const send = async (text) => {
    const question = (text ?? input).trim();
    if (!question || sending) return;

    setInput('');
    setError(null);

    // Show the user's message immediately rather than waiting for the reply
    const nextMessages = [...messages, { role: 'user', content: question }];
    setMessages(nextMessages);
    setSending(true);

    try {
      // The server is stateless, so the conversation so far goes with the
      // question. Only the turns before this one - the new question is sent
      // separately as `message`.
      const data = await assistantApi.chat(question, messages);
      setMessages([...nextMessages, { role: 'assistant', content: data.reply }]);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'The assistant could not answer that.'));
      // Drop the unanswered question so the conversation does not end on a
      // user turn with no reply
      setMessages(messages);
      setInput(question);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (event) => {
    // Enter sends, Shift+Enter makes a new line - the convention people expect
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  // Nothing renders for signed-out visitors or when the server has no key
  if (!user || !available) return null;

  const firstName = profile?.name?.split(' ')[0] || 'there';

  return (
    <>
      {/* ---------- floating button ---------- */}
      <motion.button
        type="button"
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-label={open ? 'Close the assistant' : 'Open the assistant'}
        initial={prefersReducedMotion ? false : { scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
        whileHover={prefersReducedMotion ? {} : { scale: 1.06 }}
        whileTap={prefersReducedMotion ? {} : { scale: 0.94 }}
        className="eco-assistant-fab"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={open ? 'close' : 'open'}
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 90, opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.22 }}
            style={{ display: 'flex' }}
          >
            {open ? <X size={22} /> : <Sparkles size={22} />}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      {/* ---------- chat panel ---------- */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={prefersReducedMotion ? {} : { opacity: 0, y: 20, scale: 0.97 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            className="eco-card eco-glass eco-assistant-panel"
          >
            {/* --- header --- */}
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
                  background: 'linear-gradient(135deg, var(--eco-primary), var(--eco-purple))',
                  color: '#04140c',
                  flexShrink: 0,
                }}
              >
                <Bot size={18} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>EcoTrack Assistant</div>
                <div className="eco-text-muted" style={{ fontSize: '0.74rem' }}>
                  Reads your data · cannot change anything
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

            {/* --- messages --- */}
            <div
              ref={scrollRef}
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '1rem 0',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.85rem',
              }}
            >
              {messages.length === 0 && !sending && (
                <div>
                  <p style={{ fontSize: '0.92rem', marginBottom: '0.3rem' }}>
                    Hello {firstName}.
                  </p>
                  <p
                    className="eco-text-muted"
                    style={{ fontSize: '0.86rem', marginBottom: '1.1rem' }}
                  >
                    Ask me about your footprint, your goals, or how any part of
                    EcoTrack works. I only see your own data.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    {STARTER_QUESTIONS.map((question) => (
                      <button
                        key={question}
                        type="button"
                        onClick={() => send(question)}
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
                        onMouseEnter={(event) => {
                          event.currentTarget.style.borderColor =
                            'rgba(var(--eco-primary-rgb), 0.4)';
                          event.currentTarget.style.background =
                            'rgba(var(--eco-primary-rgb), 0.06)';
                        }}
                        onMouseLeave={(event) => {
                          event.currentTarget.style.borderColor = 'var(--eco-border)';
                          event.currentTarget.style.background = 'transparent';
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
                    transition={{ duration: 0.28 }}
                    style={{
                      display: 'flex',
                      gap: '0.6rem',
                      // The user's own messages align right, like every chat app
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
                        maxWidth: '80%',
                        padding: '0.65rem 0.85rem',
                        borderRadius: 'var(--eco-radius-sm)',
                        background: isUser
                          ? 'rgba(var(--eco-primary-rgb), 0.1)'
                          : 'var(--eco-bg-alt)',
                        fontSize: '0.87rem',
                        lineHeight: 1.6,
                        // The reply is plain text with real line breaks; this
                        // preserves them without needing a markdown renderer
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {message.content}
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
                    Reading your data…
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

            {/* --- input --- */}
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
                placeholder="Ask about your footprint…"
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
                  fontSize: '0.87rem',
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
      </AnimatePresence>
    </>
  );
}
