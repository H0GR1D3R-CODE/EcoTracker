// EcoTrack/frontend/src/components/PublicHelper.jsx
//
// The navigation helper shown to SIGNED-OUT visitors on the public pages.
//
// This is deliberately NOT the AI assistant. The AI assistant (Assistant.jsx)
// reads the signed-in user's real data and needs a login, so it cannot run for
// a visitor. This helper answers "what is this / how do I start / how does it
// work" from a fixed set of topics - no login, no API key, no per-request cost,
// and nothing to abuse. It is a guide, not a chatbot pretending to be one.
//
// Which helper a person sees is decided in App.jsx: this one for logged-out
// visitors, the real AI assistant for logged-in users. Only ever one at a time.

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Bot, HelpCircle, Send, Sparkles, User, X } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

// The knowledge base. Each topic has keywords (matched against free text), the
// question shown as a suggestion chip, the answer, and an optional link.
const TOPICS = [
  {
    keywords: ['what', 'about', 'ecotrack', 'purpose', 'do'],
    question: 'What is EcoTrack?',
    answer:
      'EcoTrack turns your everyday activities — travel, electricity, meals, and more — into kilograms of CO₂, so you can see your carbon footprint, watch it over time, and bring it down. It is built around UN Sustainable Development Goal 13: Climate Action.',
  },
  {
    keywords: ['start', 'begin', 'get started', 'sign up', 'register', 'account', 'how do i use'],
    question: 'How do I get started?',
    answer:
      'Create a free account, then open the Calculator and log one activity — a car trip, an electricity bill, a meal. That single entry brings your whole Dashboard to life. It takes about thirty seconds.',
    link: { to: '/register', label: 'Create a free account' },
  },
  {
    keywords: ['calculate', 'calculated', 'factor', 'number', 'kg', 'co2', 'work', 'science', 'how does'],
    question: 'How are emissions calculated?',
    answer:
      'Every activity is multiplied by a published emission factor: emission = quantity × factor. For example, 30 km in a petrol car is 30 × 0.141 = 4.23 kg CO₂. The factors come from DEFRA, the IPCC, the Central Electricity Authority of India, and Our World in Data — never invented numbers.',
  },
  {
    keywords: ['categor', 'transport', 'electricity', 'fuel', 'diet', 'waste', 'water', 'consumption', 'seven'],
    question: 'What can I track?',
    answer:
      'Seven categories: Transport, Electricity, Fuel, Diet, Waste, Water and Consumption. Click any of the category cards on this page to see exactly what each one measures and the factors behind it.',
  },
  {
    keywords: ['goal', 'target', 'reduce', 'reduction'],
    question: 'How do goals work?',
    answer:
      'Goals are set per category — for example, "cut my transport emissions 25% by December". A per-category target tells you what to actually change, which a single overall target never does. The Goals page shows a live progress ring for each one.',
  },
  {
    keywords: ['report', 'summary', 'summarise', 'pdf', 'download', 'export'],
    question: 'What are reports?',
    answer:
      'A report is a written summary of any period you choose — this month, this year, or a custom range. It breaks down where your carbon went, names your heaviest day, and can be printed or saved as a PDF.',
  },
  {
    keywords: ['free', 'cost', 'price', 'pay', 'money', 'subscription'],
    question: 'Is it free?',
    answer:
      'Yes — EcoTrack is completely free to use. Create an account and start tracking; there is nothing to pay.',
    link: { to: '/register', label: 'Start tracking free' },
  },
  {
    keywords: ['data', 'privacy', 'safe', 'secure', 'security', 'protect'],
    question: 'Is my data private?',
    answer:
      'Your data is yours alone. Sign-in is handled by Firebase Authentication, and every request to the server is verified against your identity before any data is read — so no one can see another person’s footprint.',
  },
  {
    keywords: ['login', 'log in', 'sign in', 'existing'],
    question: 'I already have an account',
    answer: 'Welcome back — head to the login page to pick up where you left off.',
    link: { to: '/login', label: 'Log in' },
  },
];

// The greeting shown before any question is asked
const OPENERS = [
  'What is EcoTrack?',
  'How do I get started?',
  'How are emissions calculated?',
  'Is it free?',
];

/**
 * Find the best matching topic for a free-text question, or null if none match.
 */
function matchTopic(text) {
  const query = text.toLowerCase();

  let best = null;
  let bestScore = 0;

  for (const topic of TOPICS) {
    // Score by how many of the topic's keywords appear in the question
    const score = topic.keywords.reduce(
      (count, keyword) => (query.includes(keyword) ? count + 1 : count),
      0
    );
    if (score > bestScore) {
      bestScore = score;
      best = topic;
    }
  }

  return bestScore > 0 ? best : null;
}

export default function PublicHelper() {
  const { user, loading } = useAuth();
  const { prefersReducedMotion } = useTheme();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  // Answer a question (from a chip or from typed text)
  const ask = (rawText) => {
    const text = (rawText ?? input).trim();
    if (!text) return;

    setInput('');
    const topic = matchTopic(text);

    const reply = topic
      ? { role: 'bot', answer: topic.answer, link: topic.link }
      : {
          role: 'bot',
          answer:
            'I can help with getting started, how emissions are calculated, the seven categories, goals, reports, privacy, and pricing. Try one of those, or the suggestions below.',
        };

    setMessages((current) => [...current, { role: 'user', text }, reply]);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      ask();
    }
  };

  // Only for signed-out visitors. While auth is still resolving, render nothing
  // so the button does not flash in and back out.
  if (loading || user) return null;

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
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={open ? 'close' : 'open'}
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 90, opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.22 }}
            style={{ display: 'flex' }}
          >
            {open ? <X size={22} /> : <HelpCircle size={22} />}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      {/* ---------- panel ---------- */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={prefersReducedMotion ? {} : { opacity: 0, y: 20, scale: 0.97 }}
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
                  background: 'linear-gradient(135deg, var(--eco-primary), var(--eco-purple))',
                  color: '#04140c',
                  flexShrink: 0,
                }}
              >
                <Sparkles size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>EcoTrack Guide</div>
                <div className="eco-text-muted" style={{ fontSize: '0.74rem' }}>
                  Ask how EcoTrack works
                </div>
              </div>
            </div>

            {/* messages */}
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
              {messages.length === 0 && (
                <div>
                  <p style={{ fontSize: '0.92rem', marginBottom: '0.3rem' }}>
                    Hi! I can show you around EcoTrack.
                  </p>
                  <p className="eco-text-muted" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
                    Pick a question, or type your own.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    {OPENERS.map((question) => (
                      <button
                        key={question}
                        type="button"
                        onClick={() => ask(question)}
                        style={{
                          textAlign: 'left',
                          padding: '0.6rem 0.75rem',
                          borderRadius: 'var(--eco-radius-sm)',
                          border: '1px solid var(--eco-border)',
                          background: 'transparent',
                          color: 'var(--eco-text)',
                          fontSize: '0.84rem',
                          cursor: 'pointer',
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
                    key={index}
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

                    <div style={{ maxWidth: '82%' }}>
                      <div
                        style={{
                          padding: '0.65rem 0.85rem',
                          borderRadius: 'var(--eco-radius-sm)',
                          background: isUser
                            ? 'rgba(var(--eco-primary-rgb), 0.1)'
                            : 'var(--eco-bg-alt)',
                          fontSize: '0.87rem',
                          lineHeight: 1.6,
                        }}
                      >
                        {isUser ? message.text : message.answer}
                      </div>

                      {/* an answer can offer a direct action, e.g. "Create an account" */}
                      {message.link && (
                        <Link
                          to={message.link.to}
                          onClick={() => setOpen(false)}
                          className="eco-btn eco-btn-primary"
                          style={{ marginTop: '0.5rem', fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
                        >
                          {message.link.label}
                          <ArrowRight size={14} />
                        </Link>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* input */}
            <div
              style={{
                paddingTop: '0.85rem',
                borderTop: '1px solid var(--eco-border)',
                display: 'flex',
                gap: '0.5rem',
                alignItems: 'center',
              }}
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about EcoTrack…"
                style={{
                  flex: 1,
                  padding: '0.6rem 0.75rem',
                  borderRadius: 'var(--eco-radius-sm)',
                  border: '1px solid var(--eco-border)',
                  background: 'rgba(var(--eco-primary-rgb), 0.04)',
                  color: 'var(--eco-text)',
                  fontSize: '0.87rem',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={() => ask()}
                disabled={!input.trim()}
                aria-label="Send"
                className="eco-btn eco-btn-primary"
                style={{ padding: '0.6rem 0.75rem', minHeight: 40 }}
              >
                <Send size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
