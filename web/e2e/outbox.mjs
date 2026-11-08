import { tmpdir } from 'node:os';
import path from 'node:path';
/** Development mailer writes outgoing emails here during end-to-end runs. */
export const OUTBOX = path.join(tmpdir(), 'sarthiai-e2e-outbox.jsonl');

/** Platform admin created by e2e/server.mjs in the throwaway database. */
export const E2E_ADMIN = { email: 'e2e-admin@example.test', password: 'e2e-admin-password-123' };
