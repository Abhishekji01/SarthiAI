/**
 * Imports curated colleges, verified learning resources, and verified
 * opportunity records into the configured database.
 *   npm run seed            # uses MONGODB_URI
 *   npm run seed -- --dry   # validate only
 */
import { readFile } from 'node:fs/promises';
import { env } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { importColleges, importOpportunities, importResources, ingestScrapedRecords } from '../src/ingestion/importer.js';

const load = async (name) => JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url), 'utf8')).records;

export async function seedAll({ dryRun = false } = {}) {
  const [colleges, resources, opportunities] = await Promise.all([
    load('colleges.json'), load('resources.json'), load('verified-opportunities.json'),
  ]);
  // Candidate resources that passed the daily link check (ingest/check_resources.py).
  const checked = await readFile(new URL('../data/resources-verified.json', import.meta.url), 'utf8').then(JSON.parse).catch(() => null);
  const checkedResources = dryRun || !checked?.records?.length ? { skipped: true }
    : await importResources(checked.records.map(({ checkedAt, ...r }) => r), new Date(checked.checkedAt));
  const report = {
    colleges: dryRun ? { skipped: true } : await importColleges(colleges),
    resources: dryRun ? { skipped: true } : await importResources(resources),
    linkCheckedResources: checkedResources,
    opportunities: await importOpportunities(opportunities, { dryRun }),
  };
  // Latest snapshot from the official-source scrapers (refreshed daily by .github/workflows/refresh-data.yml),
  // so a fresh deployment starts with real scholarships, internships and jobs.
  const snapshot = await readFile(new URL('../data/scraped/records.json', import.meta.url), 'utf8').then(JSON.parse).catch(() => null);
  if (snapshot?.records?.length && !dryRun) {
    const merged = await ingestScrapedRecords(snapshot.records);
    const { runDateWatches } = await import('../src/notify/jobs.js');
    report.dateAlerts = await runDateWatches().catch(() => null);
    report.scraped = { generatedAt: snapshot.generatedAt, inserted: merged.inserted, updated: merged.updated, datesRefreshed: merged.datesRefreshed, rejected: merged.rejected.length };
  }
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dryRun = process.argv.includes('--dry');
  await connectDatabase(env.MONGODB_URI);
  // End-to-end tests start from an empty database. Needs both the flag and E2E_RESET_DB=true.
  if (process.argv.includes('--reset') && process.env.E2E_RESET_DB === 'true') {
    const { default: mongoose } = await import('mongoose');
    await mongoose.connection.dropDatabase();
  }
  const report = await seedAll({ dryRun });
  console.log(JSON.stringify(report, null, 2));
  await disconnectDatabase();
  if (report.opportunities.rejected.length) process.exitCode = 1;
}
