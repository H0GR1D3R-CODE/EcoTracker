// EcoTrack/frontend/src/utils/validation.js
// Shared input rules, so the same field is never judged by two different
// standards in two different files.

/**
 * A practical email check.
 *
 * WHY NOT JUST /.+@.+/ OR THE FULL RFC?
 * The real RFC 5322 grammar allows quoted strings, comments and bracketed IP
 * literals; implementing it would reject almost nothing and confuse everyone.
 * The opposite extreme waves through "a@b" and "user@site." as valid. This sits
 * in between: it accepts every address a person is realistically typing, and
 * rejects the shapes that are simply mistakes.
 *
 * Accepts   user@gmail.com · user@yahoo.co.uk · first.last+tag@hotmail.com
 *           student@bcah.christuniversity.in  (any depth of subdomain)
 * Rejects   asdasd · user@site · user@.com · user@site. · user@site..com
 *
 * Deliberately NOT limited to one provider: people arrive with Yahoo, Outlook,
 * Proton and university addresses, and locking the app to a single domain turns
 * them all away at the door.
 */
export const EMAIL_PATTERN =
  /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

/** Whether a string looks like a usable email address. Trims first. */
export function isValidEmail(value) {
  return EMAIL_PATTERN.test(String(value || '').trim());
}

/** The one wording used wherever an email fails validation. */
export const EMAIL_ERROR = 'That email address does not look valid.';

/**
 * A person's name: letters only (any script - \p{L} covers accented Latin,
 * Devanagari, etc., not just A-Z), plus the punctuation real names actually
 * use - a space, apostrophe, hyphen or period (initials like "J.R.",
 * surnames like "O'Brien-Smith"). No digits, no other symbols. This is the
 * rule behind "only strings, no numbers" in the registration/profile forms -
 * matches backend/routes/auth.py's _validate_name() exactly, so a name the
 * client accepts is never rejected by the server, or vice versa.
 */
export const NAME_PATTERN = /^[\p{L}][\p{L} '.-]*$/u;

/** Whether a string is a usable name once trimmed. */
export function isValidName(value) {
  return NAME_PATTERN.test(String(value || '').trim());
}

export const NAME_ERROR =
  'Name can only contain letters, spaces, hyphens, apostrophes and periods — no numbers or symbols.';

/**
 * Strips characters a name field should never contain, for filtering
 * keystrokes as the user types rather than only complaining after the fact.
 */
export function sanitizeNameInput(value) {
  return String(value || '').replace(/[^\p{L} '.-]/gu, '');
}

/**
 * The password policy - one definition, shared by every place a password is
 * ever CHOSEN (Register.jsx's step 2, ResetPassword.jsx after a reset-email
 * link). Each rule has a label and a test; these drive both the live
 * checklist shown next to the field and whether the password is accepted, so
 * the rules a person sees are exactly the rules enforced. The Flask backend
 * enforces the same set for registration - see backend/routes/auth.py's own
 * password check - so the policy cannot be bypassed by skipping the form.
 *
 * ResetPassword.jsx is a genuine second caller, not a hypothetical one:
 * confirmPasswordReset() talks to Firebase directly and has no idea this
 * policy exists, so without checking it here too, someone resetting a
 * password could set one weaker than registration would ever have allowed.
 */
export const PASSWORD_RULES = [
  { labelKey: 'register.ruleMinLength', test: (p) => p.length >= 8 },
  { labelKey: 'register.ruleUppercase', test: (p) => /[A-Z]/.test(p) },
  { labelKey: 'register.ruleLowercase', test: (p) => /[a-z]/.test(p) },
  { labelKey: 'register.ruleNumber', test: (p) => /\d/.test(p) },
  { labelKey: 'register.ruleSpecial', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

/** How many rules a password satisfies, for the strength bar. */
export function scorePassword(password) {
  if (!password) return { score: 0, labelKey: null, color: 'var(--eco-border)' };

  const met = PASSWORD_RULES.filter((rule) => rule.test(password)).length;

  // "Fair" was --eco-orange, which measures 3.29:1 on the paper ground - under
  // the 4.5:1 floor a label at this size needs. "Good" was a hardcoded
  // #eab308 matching no theme variable at all. Both are now measured,
  // theme-aware values: the instrument amber, then the electricity category's
  // gold, giving a real progression toward green rather than two granular
  // near-identical yellows.
  const levels = [
    { labelKey: 'register.strengthTooWeak', color: 'var(--eco-danger)' },
    { labelKey: 'register.strengthTooWeak', color: 'var(--eco-danger)' },
    { labelKey: 'register.strengthWeak', color: 'var(--eco-danger)' },
    { labelKey: 'register.strengthFair', color: 'var(--readout)' },
    { labelKey: 'register.strengthGood', color: 'var(--cat-electricity)' },
    { labelKey: 'register.strengthStrong', color: 'var(--eco-primary)' },
  ];

  return { score: met, total: PASSWORD_RULES.length, ...levels[met] };
}
