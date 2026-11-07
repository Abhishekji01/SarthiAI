/**
 * Input hygiene for free text people type (names, titles, notes). React escapes
 * output already; this keeps stored data clean for emails, exports and other
 * clients: HTML tags and control characters are removed, whitespace trimmed.
 * A lone "<" (as in "a < b") is kept; only things shaped like tags are removed.
 */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g;
const TAG = /<\/?[a-zA-Z!][^<>]*>?/g;

/** Single-line text: no tags, no control characters, no line breaks, single spaces. */
export function plainLine(s) {
  return String(s ?? '').replace(TAG, ' ').replace(CONTROL, '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

/** Multi-line text: like plainLine but keeps line breaks. */
export function plainText(s) {
  return String(s ?? '').replace(TAG, ' ').replace(CONTROL, '').replace(/\r\n?/g, '\n').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
