import { norm, canonical, isKnownConcept, relatedOf } from './taxonomy.js';

/**
 * Ranked, typo-tolerant, synonym-aware search over a candidate set.
 *
 * - Phrases are recognised ("machine learning" == "ML" == "machine-learning").
 * - Every query term must match (AND) in strict mode, but a term can be
 *   satisfied by an alias, a closely related concept, a stem, a prefix or a
 *   small typo. Only if strict mode finds nothing do we relax to "most terms"
 *   and report `relaxed: true`, so the client can say "showing related results".
 * - BM25-style scoring with per-field weights (title > tags > skills > org > text).
 *
 * Deterministic and dependency-free; candidate sets are small (<= 500 docs).
 */

const STOPWORDS = new Set(('a an and or the of for in on at to by with from into about as is are be me my i we our you your '
  + 'any all some best top good new latest near nearby find show list get give want need looking look search '
  + 'opportunity opportunities student students india indian college colleges please can how what which who where when').split(' '));

const FIELD_WEIGHTS = { title: 3, tags: 2.5, skills: 2, type: 2, organization: 1.5, rules: 1, text: 1 };

function stem(w) {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /(ss|x|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) return w.slice(0, -1);
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  return w;
}

const words = (text) => String(text ?? '')
  .toLowerCase()
  .replace(/c\+\+/g, 'cpp').replace(/c#/g, 'csharp').replace(/\.net\b/g, 'dotnet').replace(/node\.js/g, 'nodejs')
  .replace(/b\.\s?tech/g, 'btech').replace(/b\.\s?e\./g, 'be').replace(/m\.\s?tech/g, 'mtech')
  .split(/[^a-z0-9]+/)
  .filter(Boolean);

/** Concept ids found in a word list via 1-3 word n-grams. */
function conceptsIn(ws) {
  const found = new Set();
  const covered = new Set();
  for (let n = 3; n >= 1; n -= 1) {
    for (let i = 0; i + n <= ws.length; i += 1) {
      const gram = ws.slice(i, i + n).join('');
      // Single letters ("r", "c") are only concepts when the field is a skill list.
      if (gram.length < 2) continue;
      if (isKnownConcept(gram)) {
        found.add(canonical(gram));
        for (let k = i; k < i + n; k += 1) covered.add(k);
      }
    }
  }
  return { found, covered };
}

function analyzeField(text, { skillList = false } = {}) {
  const ws = words(text);
  const tokens = new Set(ws.filter((w) => !STOPWORDS.has(w)).map(stem));
  const { found } = conceptsIn(ws);
  if (skillList) for (const item of String(text).split('\u0001')) if (isKnownConcept(item)) found.add(canonical(item));
  return { tokens, concepts: found };
}

function docFields(o) {
  const join = (arr) => (arr ?? []).join('\u0001');
  return {
    title: analyzeField(o.title),
    tags: analyzeField(join(o.tags), { skillList: true }),
    skills: analyzeField(join([...(o.requiredSkills ?? []), ...(o.preferredSkills ?? [])]), { skillList: true }),
    type: analyzeField(o.opportunityType, { skillList: true }),
    organization: analyzeField(o.organization),
    rules: analyzeField([...(o.eligibilityRules ?? []).map((r) => r.label), ...(o.eligibleBranches ?? []), ...(o.eligibleDegrees ?? [])].join(' ')),
    text: analyzeField(`${o.summary ?? ''} ${o.officialDescription ?? ''} ${o.location?.city ?? ''} ${o.location?.state ?? ''} ${o.location?.description ?? ''}`),
  };
}

/** Optimal-string-alignment distance, capped for speed. */
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2 = new Array(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j += 1) prev2[j] = prev[j];
    prev = cur;
  }
  return prev[b.length];
}

/** Parses a query into AND-groups: concept groups and word groups. */
export function parseQuery(q) {
  const ws = words(q);
  const { found, covered } = conceptsIn(ws);
  const groups = [];
  for (const id of found) {
    const related = relatedOf(id, 0.6);
    groups.push({ kind: 'concept', id, related, label: id });
  }
  ws.forEach((w, i) => {
    if (covered.has(i) || STOPWORDS.has(w)) return;
    if (w.length < 2 && !/\d/.test(w)) return;
    groups.push({ kind: 'word', term: stem(w), raw: w, label: w });
  });
  return groups;
}

function wordMatch(term, tokens) {
  if (tokens.has(term)) return 1;
  let best = 0;
  const maxEdits = term.length >= 8 ? 2 : term.length >= 5 ? 1 : 0;
  for (const t of tokens) {
    if (term.length >= 3 && t.startsWith(term)) best = Math.max(best, 0.75);
    else if (t.length >= 4 && term.startsWith(t) && term.length - t.length <= 2) best = Math.max(best, 0.7);
    else if (maxEdits && !/\d/.test(term) && editDistance(term, t, maxEdits) <= maxEdits) best = Math.max(best, 0.6);
    if (best >= 0.75) break;
  }
  return best;
}

// Related-concept credit only where the listing states its focus; long descriptions mention
// everything, so counting related terms there would make every listing match.
const RELATED_FIELDS = new Set(['title', 'tags', 'skills', 'type']);

const FOCUS_FIELDS = new Set(['title', 'tags', 'type', 'organization']);

function groupMatch(group, fields) {
  let best = 0;
  let via = null;
  let focus = false;
  for (const [name, f] of Object.entries(fields)) {
    const fw = FIELD_WEIGHTS[name];
    let m = 0;
    let how = null;
    if (group.kind === 'concept') {
      // Concepts come from whole words/phrases (not stems), so "react" never matches "reacting".
      if (f.concepts.has(group.id)) { m = 1; how = 'exact'; } else if (RELATED_FIELDS.has(name)) {
        for (const [rid, w] of group.related) {
          if (f.concepts.has(rid) && w * 0.3 > m) { m = w * 0.3; how = 'related'; }  // below any exact mention
        }
      }
    } else {
      m = wordMatch(group.term, f.tokens);
      how = m === 1 ? 'exact' : m ? 'approximate' : null;
    }
    if (m * fw > best) { best = m * fw; via = how; }
    if (m > 0 && FOCUS_FIELDS.has(name)) focus = true;
  }
  return { score: best, via, focus };
}

/**
 * Ranks `docs` for query `q`.
 * Returns { results: [{ doc, relevance (0..1), matchedTerms, approximate }], relaxed, terms }.
 */
/** Minimum number of listings that are about the topic before mere mentions are held back. */
const FOCUS_MIN = 5;

export function rankByQuery(docs, q, { includeMentions = false } = {}) {
  const groups = parseQuery(q);
  if (!groups.length) return { results: docs.map((doc) => ({ doc, relevance: 0, matchedTerms: [], approximate: false })), relaxed: false, terms: [] };

  const analyzed = docs.map((doc) => ({ doc, fields: docFields(doc) }));
  // Document frequency per group -> IDF (rarer terms count more).
  const perDoc = analyzed.map(({ doc, fields }) => ({ doc, matches: groups.map((g) => groupMatch(g, fields)) }));
  const N = Math.max(1, docs.length);
  const idf = groups.map((_, gi) => {
    const df = perDoc.filter((d) => d.matches[gi].score > 0).length;
    return Math.log(1 + (N - df + 0.5) / (df + 0.5));
  });
  const maxPossible = groups.reduce((s, _, gi) => s + FIELD_WEIGHTS.title * idf[gi], 0) || 1;

  const scored = perDoc.map(({ doc, matches }) => {
    const hit = matches.filter((m) => m.score > 0).length;
    const raw = matches.reduce((s, m, gi) => s + m.score * idf[gi], 0);
    return {
      doc,
      hit,
      focus: matches.every((m) => m.score === 0 || m.focus),
      relevance: Math.min(1, raw / maxPossible),
      matchedTerms: groups.filter((_, gi) => matches[gi].score > 0).map((g) => g.label),
      approximate: matches.some((m) => m.via && m.via !== 'exact'),
    };
  });

  let results = scored.filter((s) => s.hit === groups.length);
  let relaxed = false;
  if (!results.length && groups.length > 1) {
    const need = Math.ceil(groups.length / 2);
    results = scored.filter((s) => s.hit >= need);
    relaxed = results.length > 0;
  }
  // Long descriptions mention many topics ("AI/ML is a plus"). When enough listings are actually
  // about the query (title, tags, type, organisation), show those and report the rest as mentions.
  let hiddenMentions = 0;
  const focused = results.filter((r) => r.focus);
  if (!includeMentions && focused.length >= FOCUS_MIN) {
    hiddenMentions = results.length - focused.length;
    results = focused;
  }
  results.sort((a, b) => b.relevance - a.relevance);
  return { results: results.map(({ hit, focus, ...r }) => r), relaxed, terms: groups.map((g) => g.label), hiddenMentions };
}

/** Shared token helper for other modules (e.g. goal similarity). */
export function contentTokens(text) {
  const ws = words(text);
  const { found } = conceptsIn(ws);
  return { tokens: new Set(ws.filter((w) => !STOPWORDS.has(w) && w.length > 2).map(stem)), concepts: found };
}

export { norm };
