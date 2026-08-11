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
