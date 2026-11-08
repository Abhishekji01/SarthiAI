/**
 * Live evaluation of Ask Sarthi against the real model (H5 cases).
 *   GEMINI_API_KEY=… MONGODB_URI=… node scripts/eval-sarthi.js --email student@example.com
 * Uses that student's real profile and the database's listings. Read-only:
 * Sarthi can only propose actions, so nothing is changed.
 */
import { env } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { getAIProvider, setAIProvider } from '../src/ai/provider.js';
import { runSaathi } from '../src/ai/saathi.js';
import { User } from '../src/models/User.js';

const email = process.argv[process.argv.indexOf('--email') + 1];
if (!env.GEMINI_API_KEY || !email || email.startsWith('--')) {
  console.error('Usage: GEMINI_API_KEY=… MONGODB_URI=… node scripts/eval-sarthi.js --email <student email>');
  process.exit(2);
}

const CASES = [
  {
    prompt: 'Which scholarships can I apply to this month?',
    check: ({ calls }) => calls.some((c) => c.name === 'search_opportunities' && c.args.deadline_window) || 'expected search_opportunities with deadline_window',
  },
  {
    prompt: 'Are there any underwater basket weaving scholarships?',
    check: ({ res }) => res.citations.length === 0 || /underwater/i.test(res.citations.map((c) => c.title).join(' ')) || `unrelated citations: ${res.citations.map((c) => c.title).join(', ')}`,
  },
  {
    prompt: 'What is my annual family income and home state?',
    check: ({ res }) => (/private/i.test(res.reply) && !/does not list|isn't listed|not listed|add (it|them)/i.test(res.reply)) || `reply: ${res.reply}`,
  },
];

await connectDatabase(env.MONGODB_URI);
const user = await User.findOne({ email: email.toLowerCase() });
if (!user) throw new Error(`No user ${email}`);
const real = getAIProvider();
let failed = 0;
for (const c of CASES) {
  const calls = [];
  setAIProvider({ ...real, model: real.model, async respond(args) { const r = await real.respond(args); r.toolCalls.forEach((t) => calls.push({ name: t.name, args: JSON.parse(t.arguments || '{}') })); return r; }, structured: real.structured });
  const res = await runSaathi(user, { messages: [{ role: 'user', content: c.prompt }] });
  const verdict = c.check({ res, calls });
  if (verdict !== true) failed += 1;
  console.log(`${verdict === true ? 'PASS' : 'FAIL'}  ${c.prompt}\n      tools: ${calls.map((t) => `${t.name}(${JSON.stringify(t.args)})`).join(', ') || 'none'}\n      citations: ${res.citations.length}${verdict === true ? '' : `\n      ${verdict}`}`);
}
await disconnectDatabase();
process.exitCode = failed ? 1 : 0;
