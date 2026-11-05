/**
 * Grounding check for chat replies.
 *
 * The model is told to use only tool results, but LLMs still occasionally
 * "fill in" a plausible deadline or amount. Dates and money are the facts a
 * student acts on, so every date and amount in a reply is checked against the
 * text the tools actually returned (plus the student's own messages). Claims
 * that cannot be found are reported so the caller can ask the model to fix
 * them, or flag them to the student.
 */

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_RX = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const monthIndex = (m) => MONTHS.findIndex((x) => x.startsWith(m.toLowerCase().slice(0, 3)));
const pad = (n) => String(n).padStart(2, '0');

/** Extracts dates as { text, md: 'MM-DD', ymd: 'YYYY-MM-DD' | null }. */
export function extractDates(text) {
  const out = [];
  const t = String(text ?? '');
  const push = (raw, y, m, d) => {
    if (m < 0 || m > 11 || d < 1 || d > 31) return;
    out.push({ text: raw.trim(), md: `${pad(m + 1)}-${pad(d)}`, ymd: y ? `${y}-${pad(m + 1)}-${pad(d)}` : null });
  };
  for (const x of t.matchAll(/\b(\d{4})-(\d{2})-(\d{2})/g)) push(x[0], x[1], Number(x[2]) - 1, Number(x[3]));
  for (const x of t.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RX}\\.?,?\\s*(\\d{4})?`, 'gi'))) push(x[0], x[3], monthIndex(x[2]), Number(x[1]));
  for (const x of t.matchAll(new RegExp(`\\b${MONTH_RX}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b,?\\s*(\\d{4})?`, 'gi'))) push(x[0], x[3], monthIndex(x[1]), Number(x[2]));
  for (const x of t.matchAll(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/g)) push(x[0], x[3], Number(x[2]) - 1, Number(x[1]));
  return out;
}

/** Extracts rupee amounts as { text, value } (value in rupees). */
export function extractAmounts(text) {
  const out = [];
  const rx = /(?:₹|\brs\.?|\binr)\s*([\d,]+(?:\.\d+)?)\s*(lakhs?|lacs?|crores?|cr|k)?\b/gi;
  for (const x of String(text ?? '').matchAll(rx)) {
    let v = Number(x[1].replace(/,/g, ''));
    const unit = (x[2] ?? '').toLowerCase();
    if (unit.startsWith('lakh') || unit.startsWith('lac')) v *= 100000;
    else if (unit.startsWith('cr')) v *= 10000000;
    else if (unit === 'k') v *= 1000;
    if (Number.isFinite(v) && v > 0) out.push({ text: x[0].trim(), value: Math.round(v) });
  }
  return out;
}

/** Builds a fast lookup of every date and number present in the evidence text. */
export function buildEvidence(texts) {
  const joined = texts.filter(Boolean).join('\n');
  const dates = extractDates(joined);
  const ymd = new Set(dates.map((d) => d.ymd).filter(Boolean));
  const md = new Set(dates.map((d) => d.md));
  // Also accept ISO timestamps converted to IST calendar dates.
  for (const x of joined.matchAll(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})/g)) {
    const d = new Date(x[0]);
    if (!Number.isNaN(d.getTime())) {
      const ist = new Date(d.getTime() + 5.5 * 3600000).toISOString().slice(0, 10);
      ymd.add(ist);
      md.add(ist.slice(5));
    }
  }
  const numbers = new Set();
  for (const x of joined.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const n = Number(x[0].replace(/,/g, ''));
    if (Number.isFinite(n)) numbers.add(Math.round(n));
  }
  for (const a of extractAmounts(joined)) numbers.add(a.value);
  return { ymd, md, numbers };
}

/** Returns the date/amount claims in `reply` that the evidence does not support. */
export function findUngroundedClaims(reply, evidence, { today } = {}) {
  const claims = [];
  for (const d of extractDates(reply)) {
    if (today && (d.ymd === today || d.md === today.slice(5))) continue;
    const ok = d.ymd ? evidence.ymd.has(d.ymd) : evidence.md.has(d.md);
    if (!ok) claims.push({ kind: 'date', text: d.text });
  }
  for (const a of extractAmounts(reply)) {
    if (!evidence.numbers.has(a.value)) claims.push({ kind: 'amount', text: a.text });
  }
  // De-duplicate by text.
  const seen = new Set();
  return claims.filter((c) => (seen.has(c.text) ? false : seen.add(c.text)));
}
