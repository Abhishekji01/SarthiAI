/**
 * H5 evaluation cases: prompt → expected tool call, tool output, or citation set.
 * The model is scripted (fake provider) so these run in CI; scripts/eval-sarthi.js
 * runs the same prompts against the real model when GEMINI_API_KEY is set.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { connectTestDb, disconnectTestDb, registerStudent, createOpportunity, setProfile } from './helpers.js';
import { setAIProvider } from '../src/ai/provider.js';
import { runSaathi, searchTool, citationsMentioned, SAATHI_INSTRUCTIONS } from '../src/ai/saathi.js';
import { quickAnswer } from '../src/ai/quick.js';
import { User } from '../src/models/User.js';

const NOW = new Date('2026-11-07T06:00:00Z');
const at = (iso) => new Date(`${iso}T23:59:00+05:30`);
let app;
let user;
let agri;
const thisMonth = [];

beforeAll(async () => {
  app = await connectTestDb('sarthi_evals');
  const s = await registerStudent(app, { name: 'Isha Sharma' });
  await setProfile(app, s.token, { degree: 'B.Tech', branch: 'CSE', currentYear: 2, homeState: 'Uttar Pradesh', annualFamilyIncomeINR: 150000 });
  user = await User.findById(s.user.id);
  // 22 scholarships closing 30 Nov whose income rule is unanswered → "confirm eligibility" (the reported case).
  for (let i = 0; i < 22; i += 1) {
    thisMonth.push(await createOpportunity({ title: `Merit Scholarship ${String.fromCharCode(65 + i)}`, opportunityType: 'scholarship', deadline: at('2026-11-30'), lastVerifiedAt: NOW, eligibilityRules: [{ key: 'disability', kind: 'self_declared', label: 'Student with a disability (40%+)', restrictsAudience: false }] }));
  }
  agri = await createOpportunity({ title: 'Agriculture Talent Scholarship', opportunityType: 'scholarship', deadline: at('2026-11-20'), lastVerifiedAt: NOW, eligibleDegrees: ['B.Tech'] });
  await createOpportunity({ title: 'Medical Students Scholarship', opportunityType: 'scholarship', deadline: at('2026-11-25'), lastVerifiedAt: NOW, eligibleDegrees: ['MBBS'] });
  await createOpportunity({ title: 'December Scholarship', opportunityType: 'scholarship', deadline: at('2026-12-15'), lastVerifiedAt: NOW });
  await createOpportunity({ title: 'November Internship', opportunityType: 'internship', deadline: at('2026-11-28'), lastVerifiedAt: NOW });
});
afterEach(() => setAIProvider(undefined));
afterAll(disconnectTestDb);

function scripted(responses) {
  const calls = [];
  return { model: 'fake', calls, async respond(args) { calls.push(args); return responses.shift(); }, async structured() { throw new Error('unused'); } };
}
const toolCall = (name, args) => ({ text: '', toolCalls: [{ callId: name, name, arguments: JSON.stringify(args) }], rawContent: { role: 'model', parts: [] } });
const say = (text) => ({ text, toolCalls: [], rawContent: undefined });

describe('Eval 1: "Which scholarships can I apply to this month?"', () => {
  const prompt = 'Which scholarships can I apply to this month?';

  it('the tool schema and rules steer "this month" questions to a deadline-window search', () => {
    expect(SAATHI_INSTRUCTIONS).toMatch(/this month.*deadline_window/s);
  });

  it('search_opportunities(type=scholarship, deadline_window=this_month) returns all 23, soonest first, labelled', async () => {
    const out = await searchTool({ type: 'scholarship', deadline_window: 'this_month' }, { user, now: NOW });
    expect(out.total).toBe(23);
    expect(out.returned).toBe(20);
    expect(out.windowEnds).toBe('2026-11-30');
    expect(out.excludedBecauseLikelyNotEligible).toBe(1); // the MBBS-only one
    expect(out.results[0].title).toBe('Agriculture Talent Scholarship');
    expect(out.results[0].eligibility).toBe('likely eligible');
    expect(out.results.slice(1).every((r) => r.eligibility === 'confirm eligibility')).toBe(true);
    expect(out.results.some((r) => r.title === 'December Scholarship')).toBe(false);
    const all = await searchTool({ type: 'scholarship', deadline_window: 'this_month', limit: 25 }, { user, now: NOW });
    expect(all.returned).toBe(23);
  });

  it('the scripted model calling that tool gets every listing back, and citations follow the reply', async () => {
    const reply = `23 scholarships close this month:\n- **Agriculture Talent Scholarship** — closes 2026-11-20, likely eligible\n${thisMonth.map((o) => `- **${o.title}** — closes 2026-11-30, confirm eligibility`).join('\n')}`;
    const fake = scripted([toolCall('search_opportunities', { type: 'scholarship', deadline_window: 'this_month', limit: 25 }), say(reply)]);
    setAIProvider(fake);
    const res = await runSaathi(user, { messages: [{ role: 'user', content: prompt }] }, { now: NOW });
    expect(res.toolsUsed).toEqual(['search_opportunities']);
    const toolOutput = JSON.parse(fake.calls[1].input.find((m) => m.type === 'tool_result').output);
    expect(toolOutput.returned).toBe(23);
    expect(res.citations).toHaveLength(23);
  });

  it('quick answers (no AI) list all 23 with "confirm eligibility" labels', async () => {
    const res = await quickAnswer(user, prompt, { now: NOW });
    expect(res.toolsUsed).toEqual(['quick:window']);
    expect(res.citations).toHaveLength(23);
    expect(res.citations.map((c) => c.title)).toContain('Agriculture Talent Scholarship');
    expect(res.reply).toMatch(/23 scholarships close this month/);
    expect(res.reply.match(/confirm eligibility/g).length).toBeGreaterThanOrEqual(22);
    expect(res.reply).toMatch(/1 more was left out/);
    expect(res.reply).not.toMatch(/December Scholarship|November Internship|Medical Students/);
  });

  it('"Which deadlines are coming up for me?" still answers from the student\'s own tracker', async () => {
    expect((await quickAnswer(user, 'Which deadlines are coming up for me?', { now: NOW })).toolsUsed).toEqual(['quick:deadlines']);
  });
});

describe('Eval 2: "I couldn\'t find X" has no unrelated citations', () => {
  it('cites nothing when the reply names no listing, even after tools returned some', async () => {
    const fake = scripted([toolCall('search_opportunities', { query: 'marine biology', type: 'scholarship' }), say("I couldn't find any marine biology scholarships in SarthiAI right now. Try Find with a broader search.")]);
    setAIProvider(fake);
    const res = await runSaathi(user, { messages: [{ role: 'user', content: 'Any marine biology scholarships?' }] }, { now: NOW });
    expect(res.citations).toEqual([]);
  });

  it('cites exactly the listings the reply names, matched by id or title', () => {
    const seen = [
      { opportunityId: String(agri._id), title: 'Agriculture Talent Scholarship' },
      { opportunityId: String(thisMonth[0]._id), title: thisMonth[0].title },
      { opportunityId: String(thisMonth[1]._id), title: thisMonth[1].title },
    ];
    expect(citationsMentioned('You could apply to the agriculture talent scholarship.', seen).map((c) => c.title)).toEqual(['Agriculture Talent Scholarship']);
    expect(citationsMentioned(`See listing ${thisMonth[1]._id}.`, seen).map((c) => c.title)).toEqual([thisMonth[1].title]);
    expect(citationsMentioned('Nothing matched.', seen)).toEqual([]);
  });
});

describe('Eval 3: "What is my annual family income and home state?"', () => {
  const prompt = 'What is my annual family income and home state?';

  it('get_my_profile marks them private and never contains the values', async () => {
    const fake = scripted([toolCall('get_my_profile', {}), say("That's kept private from me; eligibility checks use it automatically.")]);
    setAIProvider(fake);
    const res = await runSaathi(user, { messages: [{ role: 'user', content: prompt }] }, { now: NOW });
    const output = fake.calls[1].input.find((m) => m.type === 'tool_result').output;
    expect(JSON.parse(output).privateFields.annualFamilyIncome).toMatch(/^private — not shared with Sarthi/);
    expect(output).not.toMatch(/150000|1,50,000|Uttar Pradesh/);
    // Nothing private in the system prompt either.
    expect(fake.calls[0].instructions).not.toMatch(/150000|Uttar Pradesh/);
    expect(res.reply).toMatch(/kept private/);
  });

  it('the rules tell the model what to say instead of "your profile does not list it"', () => {
    expect(SAATHI_INSTRUCTIONS).toMatch(/That's kept private from me; eligibility checks use it automatically/);
    expect(SAATHI_INSTRUCTIONS).toMatch(/Never say their profile does not list it/);
  });

  it('quick answers say it is private instead of asking the student to add it', async () => {
    const res = await quickAnswer(user, prompt, { now: NOW });
    expect(res.toolsUsed).toEqual(['quick:private']);
    expect(res.reply).toMatch(/kept private from me/);
    expect(res.reply).not.toMatch(/does not list|not in your profile|150000|Uttar Pradesh/);
  });
});
