/**
 * Document types students commonly need for Indian scholarships, and how a
 * listing's wording maps to them. `storable: false` types (Aadhaar, bank
 * details) can be ticked as "I have it" but are never uploaded to SarthiAI.
 */
export const DOC_KINDS = {
  income_certificate: { label: 'Income certificate', rx: /income certificate|income proof|family income/i },
  caste_certificate: { label: 'Caste / category certificate', rx: /caste|category certificate|community certificate|\b(sc|st|obc|ews) certificate/i },
  domicile_certificate: { label: 'Domicile / residence certificate', rx: /domicile|residence certificate|resident certificate/i },
  disability_certificate: { label: 'Disability certificate (UDID)', rx: /disabilit|udid|pwd certificate/i },
  marksheets: { label: 'Mark sheets', rx: /mark ?sheets?|marksheet|transcript|grade card/i },
  bonafide_certificate: { label: 'Bonafide / student certificate', rx: /bonafide|bona fide|student certificate|institution certificate/i },
  admission_proof: { label: 'Admission letter / fee receipt', rx: /admission|fee receipt|allotment letter/i },
  photograph: { label: 'Passport-size photo', rx: /photo(graph)?\b/i },
  recommendation: { label: 'Recommendation / referee details', rx: /recommendation|referee|reference letter|teacher/i },
  resume: { label: 'CV / résumé', rx: /\b(cv|resume|résumé)\b/i },
  aadhaar: { label: 'Aadhaar', rx: /aadhaar|aadhar/i, storable: false },
  bank_details: { label: 'Bank account details', rx: /bank|passbook|cancelled cheque|ifsc/i, storable: false },
};

export const STORABLE_KINDS = Object.keys(DOC_KINDS).filter((k) => DOC_KINDS[k].storable !== false).concat('other');

export function kindOf(text) {
  for (const [k, v] of Object.entries(DOC_KINDS)) if (v.rx.test(String(text))) return k;
  return null;
}

/** Documents a criterion usually needs as proof (shown as "usually needed", never as the listing's own list). */
const RULE_DOCS = {
  max_family_income: 'income_certificate',
  home_state_in: 'domicile_certificate',
  category_in: 'caste_certificate',
  disability_required: 'disability_certificate',
  min_cgpa: 'marksheets',
};

/**
 * The checklist for a listing: its own requiredDocuments first (quoted), then
 * documents its criteria usually need, each marked with what the student has.
 */
export function checklistFor(opp, { have = [], uploads = [] } = {}) {
  const items = [];
  const seen = new Set();
  for (const label of opp.requiredDocuments ?? []) {
    const kind = kindOf(label);
    items.push({ label, kind, source: 'listing' });
    if (kind) seen.add(kind);
  }
  for (const r of opp.eligibilityRules ?? []) {
    let kind = RULE_DOCS[r.kind];
    if (!kind && r.kind === 'self_declared' && /disab|specially/i.test(r.label)) kind = 'disability_certificate';
    if (!kind && r.kind === 'self_declared' && /\b(SC|ST|OBC|EWS)\b|scheduled caste|scheduled tribe/.test(r.label)) kind = 'caste_certificate';
    if (kind && !seen.has(kind)) { seen.add(kind); items.push({ label: DOC_KINDS[kind].label, kind, source: 'criterion', because: r.label }); }
  }
  return items.map((i) => ({
    ...i,
    storable: i.kind ? DOC_KINDS[i.kind].storable !== false : true,
    have: Boolean(i.kind && have.includes(i.kind)),
    uploads: i.kind ? uploads.filter((u) => u.kind === i.kind).map((u) => u.id) : [],
  }));
}
