// EcoTrack/frontend/src/components/Assistant.jsx
//
// NOTE: an addition to the folder structure in the project plan, added when
// the assistant feature was approved.
//
// The floating EcoTrack Assistant - a chat panel that answers questions about
// the signed-in user's own footprint, how any part of the app works, and -
// for an admin - the platform-wide figures and the admin console itself.
//
// WHERE THE INTELLIGENCE LIVES
// Not here. This component is a chat UI and nothing more: it collects a
// question, posts it to POST /api/assistant/chat, and renders the reply. The
// Gemini API key is held only by the Flask server (backend/routes/assistant.py),
// which reads the signed-in user's real Firestore data - and, only when the
// verified token belongs to an admin, the platform-wide data and a guide to
// the admin console - and puts it in the prompt before calling Gemini.
//
// That split is deliberate. If the browser called Gemini directly, the API
// key would be sitting in the JavaScript bundle for anyone to take. The
// admin split is the same idea applied to authorisation: the server decides
// who is an admin from the verified token, so there is no client-side flag a
// regular user could flip to see platform data that was never in the prompt.
//
// The conversation lives in this component's state and is passed back to the
// server on each turn, because the Gemini API is stateless - it has no memory
// of previous requests.

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Bot, Loader2, Send, Sparkles, User, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { assistantApi, getErrorMessage } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

// The assistant now genuinely answers anything (see the backend's own
// ASSISTANT_INSTRUCTIONS), which means real code blocks, lists and tables in
// its replies - plain text with pre-wrap could not show any of that as
// anything but literal asterisks and pound signs. remark-gfm adds tables,
// strikethrough and autolinks on top of core markdown. User-typed messages
// deliberately are NOT run through this - there is no reason to interpret
// someone's own question as markdown, and it avoids a stray "*" in a
// question rendering oddly.
const MARKDOWN_COMPONENTS = {
  p: ({ children }) => <p style={{ margin: '0 0 0.6rem' }}>{children}</p>,
  ul: ({ children }) => (
    <ul style={{ margin: '0 0 0.6rem', paddingLeft: '1.2rem' }}>{children}</ul>
  ),
  ol: ({ children }) => (
    <ol style={{ margin: '0 0 0.6rem', paddingLeft: '1.2rem' }}>{children}</ol>
  ),
  li: ({ children }) => <li style={{ margin: '0.2rem 0' }}>{children}</li>,
  strong: ({ children }) => (
    <strong style={{ color: 'var(--eco-text)', fontWeight: 700 }}>{children}</strong>
  ),
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--eco-primary)' }}>
      {children}
    </a>
  ),
  h1: ({ children }) => (
    <div className="eco-display" style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0.4rem 0' }}>
      {children}
    </div>
  ),
  h2: ({ children }) => (
    <div className="eco-display" style={{ fontSize: '1rem', fontWeight: 700, margin: '0.4rem 0' }}>
      {children}
    </div>
  ),
  h3: ({ children }) => (
    <div className="eco-display" style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0.4rem 0' }}>
      {children}
    </div>
  ),
  // A fenced code block (```) arrives as <pre><code>; an inline `code` span
  // arrives as just <code> with no <pre> parent - `inline` tells them apart.
  code: ({ inline, className, children }) => {
    if (inline) {
      return (
        <code
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85em',
            background: 'rgba(var(--eco-primary-rgb), 0.1)',
            padding: '0.1em 0.35em',
            borderRadius: 4,
          }}
        >
          {children}
        </code>
      );
    }
    // The language-xxx class react-markdown attaches, shown as a small label
    // above the block rather than run through a syntax highlighter - a real
    // highlighter is a lot of extra weight for a chat panel this size.
    const language = /language-(\w+)/.exec(className || '')?.[1];
    return (
      <div style={{ margin: '0 0 0.6rem' }}>
        {language && (
          <div
            className="eco-marker"
            style={{ fontSize: '0.65rem', marginBottom: '0.2rem', opacity: 0.7 }}
          >
            {language}
          </div>
        )}
        <pre
          style={{
            margin: 0,
            padding: '0.7rem 0.85rem',
            borderRadius: 'var(--eco-radius-sm)',
            background: 'var(--eco-bg)',
            border: '1px solid var(--eco-border)',
            overflowX: 'auto',
          }}
        >
          <code
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8rem',
              lineHeight: 1.5,
              whiteSpace: 'pre',
            }}
          >
            {children}
          </code>
        </pre>
      </div>
    );
  },
  table: ({ children }) => (
    <div style={{ overflowX: 'auto', margin: '0 0 0.6rem' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: '0.82rem', width: '100%' }}>
        {children}
      </table>
    </div>
  ),
  th: ({ children }) => (
    <th
      style={{
        textAlign: 'left',
        padding: '0.35rem 0.6rem',
        borderBottom: '2px solid var(--eco-border)',
        fontWeight: 700,
      }}
    >
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td style={{ padding: '0.35rem 0.6rem', borderBottom: '1px solid var(--eco-border)' }}>
      {children}
    </td>
  ),
};

function MessageContent({ role, content }) {
  if (role === 'user') {
    // Preserves real line breaks in what the person typed, same as before.
    return <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>;
  }

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
      {content}
    </ReactMarkdown>
  );
}

// Shown when the conversation is empty, to give people a way in
const STARTER_QUESTIONS = [
  'What is my biggest source of emissions?',
  'How am I doing against last month?',
  'How do I set a goal?',
  'What is one change that would help most?',
];

// An admin sees two of their own plus two that only make sense with
// platform-wide data - a hint, right where the panel opens, that the
// assistant can see more than usual for this account specifically.
const ADMIN_STARTER_QUESTIONS = [
  'What is my biggest source of emissions?',
  'How many users signed up this month?',
  'How much has been donated in total?',
  'Where in the console do I find someone’s full activity?',
];

export default function Assistant() {
  const { user, profile, isAdmin } = useAuth();
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
  const starterQuestions = isAdmin ? ADMIN_STARTER_QUESTIONS : STARTER_QUESTIONS;

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
                  background: 'var(--eco-primary)',
                  color: 'var(--eco-bg)',
                  flexShrink: 0,
                }}
              >
                <Bot size={18} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>EcoTrack Assistant</div>
                <div className="eco-text-muted" style={{ fontSize: '0.74rem' }}>
                  {isAdmin
                    ? 'Reads your data + platform data · cannot change anything'
                    : 'Reads your data · cannot change anything'}
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
                // Without this, scrolling past the top/bottom of a short
                // conversation chains into the page behind this fixed panel
                // on iOS - a visible rubber-band bounce of content the panel
                // is supposed to be sitting on top of.
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
                    Hello {firstName}.
                  </p>
                  <p
                    className="eco-text-muted"
                    style={{ fontSize: '0.86rem', marginBottom: '1.1rem' }}
                  >
                    {isAdmin
                      ? 'Ask about your footprint, goals, how EcoTrack works, or the platform-wide figures.'
                      : 'Ask me about your footprint, your goals, or how any part of EcoTrack works. I only see your own data.'}
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    {starterQuestions.map((question) => (
                      <button
                        key={question}
                        type="button"
                        onClick={() => send(question)}
                        // Was onMouseEnter/onMouseLeave setting inline styles
                        // directly - iOS touch doesn't reliably fire
                        // mouseleave after a tap, so a tapped chip could stay
                        // highlighted until something else was touched. A CSS
                        // class with a (hover:hover) and (pointer:fine)
                        // -guarded :hover rule (see .eco-assistant-starter-btn
                        // in index.css) only ever activates on a real mouse.
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
                        // Wider than a user bubble needs, since a real reply
                        // can now contain a code block or a table - a plain
                        // sentence still wraps at whatever width its own text
                        // needs, this is only ever a ceiling.
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
                      <MessageContent role={message.role} content={message.content} />
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
                placeholder="Ask about your footprint, or anything else…"
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
                  // 1rem, not 0.87rem: iOS Safari force-zooms the whole page
                  // on focus for any text input under 16px, and doesn't
                  // reliably zoom back out - a real, repeated annoyance on
                  // an input someone is about to type a whole question into.
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
      </AnimatePresence>
    </>
  );
}
