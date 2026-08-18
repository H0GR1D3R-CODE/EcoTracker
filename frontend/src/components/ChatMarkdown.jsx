// EcoTrack/frontend/src/components/ChatMarkdown.jsx
//
// Renders an assistant reply's markdown as real HTML, themed to match the
// rest of the app. Shared by Assistant.jsx (signed-in) and PublicHelper.jsx
// (signed-out) - both now call a real model and both need their replies to
// come out as an actual code block or list, not literal asterisks and
// backticks. Extracted here specifically so the two chat panels cannot drift
// apart in how they render the same kind of content.
//
// User-typed messages are deliberately NOT run through this - there is no
// reason to interpret someone's own question as markdown, and it avoids a
// stray "*" in a question rendering oddly.

import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
  // The model sometimes points at an in-app page (e.g. "/register") rather
  // than an external URL - a plain <a> would do a full page reload for that,
  // throwing away all client-side router state. A relative path starting
  // with "/" goes through React Router's Link instead; anything else (a real
  // http(s) URL) is a genuine external link.
  a: ({ children, href }) => {
    if (href && href.startsWith('/')) {
      return (
        <Link to={href} style={{ color: 'var(--eco-primary)', fontWeight: 600 }}>
          {children}
        </Link>
      );
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--eco-primary)' }}>
        {children}
      </a>
    );
  },
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

/**
 * @param {'user' | 'assistant'} role
 * @param {string} content
 */
export default function ChatMarkdown({ role, content }) {
  if (role === 'user') {
    // Preserves real line breaks in what the person typed.
    return <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>;
  }

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
      {content}
    </ReactMarkdown>
  );
}
