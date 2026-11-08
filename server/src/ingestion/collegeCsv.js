import { College, normalizeCollegeName } from '../models/College.js';
import { plainLine } from '../utils/sanitize.js';
import { isHomeStateOption } from '../../../shared/states.js';
import { canonicalState } from '../matching/taxonomy.js';
import { HOME_STATE_OPTIONS } from '../../../shared/states.js';

/** Minimal RFC 4180 CSV parser (quoted fields, commas and newlines inside quotes). */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i += 1; } else if (c === '"') quoted = false; else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i += 1;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

/** Finds the columns in AISHE / AICTE style exports (header names vary by year). */
export function detectColumns(header) {
  const h = header.map((x) => x.trim().toLowerCase());
  const find = (rx) => h.findIndex((x) => rx.test(x));
  return {
    name: find(/^(name|college name|institute name|institution name|name of (the )?(college|institute|institution))$/),
    city: find(/^(city|town|district|district name)$/),
    state: find(/^(state|state name|state\/ut)$/),
    website: find(/website|url/),
    code: find(/aishe|aicte (id|code)|permanent id|college code|institute id/),
  };
}

const toState = (s) => {
  const c = canonicalState(s);
  return HOME_STATE_OPTIONS.find((o) => canonicalState(o) === c) ?? null;
};

/**
 * Imports institutions from an official list (CSV). Dry run unless apply: true.
 * Existing colleges (same normalised name) are never changed or duplicated.
 * Imported colleges are listed (searchable) because they come from an official list.
 */
export async function importCollegesFromCsv(text, { apply = false, source = 'csv' } = {}) {
  const [header, ...rows] = parseCsv(text);
  const col = detectColumns(header ?? []);
  if (col.name < 0) throw new Error(`No name column found. Columns: ${(header ?? []).join(', ')}`);
  const report = { rows: rows.length, valid: 0, new: 0, existing: 0, skipped: [], inserted: 0, source };
  const seen = new Set();
  const docs = [];
  for (const [i, r] of rows.entries()) {
    const name = plainLine(r[col.name] ?? '').slice(0, 160);
    if (name.length < 3) { report.skipped.push({ row: i + 2, reason: 'no name' }); continue; }
    const normalizedName = normalizeCollegeName(name);
    if (seen.has(normalizedName)) { report.skipped.push({ row: i + 2, reason: 'duplicate in file' }); continue; }
    seen.add(normalizedName);
    const state = col.state >= 0 ? toState(r[col.state] ?? '') : null;
    const website = col.website >= 0 && /^https?:\/\/\S+$/i.test((r[col.website] ?? '').trim()) ? r[col.website].trim().slice(0, 300) : undefined;
    report.valid += 1;
    docs.push({ name, normalizedName, city: col.city >= 0 ? plainLine(r[col.city] ?? '').slice(0, 60) || undefined : undefined, state: state && isHomeStateOption(state) ? state : undefined, website, aliases: [], listed: true });
  }
  const existing = new Set((await College.find({ normalizedName: { $in: docs.map((d) => d.normalizedName) } }).select('normalizedName').lean()).map((c) => c.normalizedName));
  const fresh = docs.filter((d) => !existing.has(d.normalizedName));
  report.existing = docs.length - fresh.length;
  report.new = fresh.length;
  if (apply && fresh.length) {
    const res = await College.insertMany(fresh, { ordered: false }).catch((e) => e.insertedDocs ?? []);
    report.inserted = Array.isArray(res) ? res.length : 0;
  }
  report.skipped = report.skipped.slice(0, 50);
  return report;
}
