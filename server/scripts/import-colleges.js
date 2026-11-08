/**
 * Imports a broader list of institutions from an official CSV export, such as
 * AISHE (https://aishe.gov.in, "Download List of Institutions") or the AICTE
 * approved-institutions list (https://facilities.aicte-india.org/dashboard).
 *
 *   node scripts/import-colleges.js --file aishe-colleges.csv          # dry run: report only
 *   node scripts/import-colleges.js --file aishe-colleges.csv --apply  # write to MONGODB_URI
 *
 * Before running with --apply, check that the publisher's terms allow reuse in
 * SarthiAI (this has not been confirmed). Nothing is imported automatically.
 * Existing colleges are never changed or duplicated.
 */
import { readFile } from 'node:fs/promises';
import { env } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { importCollegesFromCsv } from '../src/ingestion/collegeCsv.js';

const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const file = arg('--file');
if (!file) {
  console.error('Usage: node scripts/import-colleges.js --file <list.csv> [--apply]');
  process.exit(2);
}
const apply = process.argv.includes('--apply');
await connectDatabase(env.MONGODB_URI);
const report = await importCollegesFromCsv(await readFile(file, 'utf8'), { apply, source: file });
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry run (add --apply to write)', ...report }, null, 2));
await disconnectDatabase();
