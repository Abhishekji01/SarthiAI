import { tmpdir } from 'node:os';
import path from 'node:path';
/** Development mailer writes outgoing emails here during end-to-end runs. */
export const OUTBOX = path.join(tmpdir(), 'sarthiai-e2e-outbox.jsonl');
