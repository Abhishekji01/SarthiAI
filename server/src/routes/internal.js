import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { runAllJobs } from '../notify/jobs.js';
import { send } from '../utils/http.js';
import { notFound, unauthorized } from '../utils/errors.js';

/**
 * POST /api/internal/jobs with header X-Jobs-Secret: <JOBS_SECRET>.
 * For hosts that sleep between visits (Render free plan): an hourly cron
 * (.github/workflows/notify.yml) wakes the server and runs the reminder jobs.
 * Without JOBS_SECRET the endpoint does not exist.
 */
const router = Router();
router.post('/jobs', async (req, res) => {
  if (!env.JOBS_SECRET) throw notFound();
  const given = Buffer.from(String(req.get('x-jobs-secret') ?? ''));
  const want = Buffer.from(env.JOBS_SECRET);
  if (given.length !== want.length || !timingSafeEqual(given, want)) throw unauthorized('Bad jobs secret');
  send(res, await runAllJobs(new Date(), { forceDigest: req.query.digest === 'force' }));
});
export default router;
