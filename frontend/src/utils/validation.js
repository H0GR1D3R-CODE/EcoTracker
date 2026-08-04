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
