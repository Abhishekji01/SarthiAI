import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import { connectTestDb, disconnectTestDb, registerStudent, auth, setProfile } from './helpers.js';
import { checkEligibility, eligibilityForModel } from '../src/eligibility/engine.js';
import { evaluateAudience } from '../src/eligibility/audience.js';
import { ingestScrapedRecords } from '../src/ingestion/importer.js';
import { Opportunity } from '../src/models/Opportunity.js';
import { User } from '../src/models/User.js';
import { setAIProvider } from '../src/ai/provider.js';

const scheme = (name) => ({ key: 'target_group', kind: 'self_declared', mandatory: true, restrictsAudience: true, label: `You belong to the group this scheme is for (see the scheme name: ${name})` });
const status = (name, profile) => checkEligibility({ verificationStatus: 'verified', eligibilityRules: [scheme(name)] }, profile).criteria[0].status;

describe('F3: scheme groups read from the official scheme names', () => {
  it('AICTE Pragati (girls), Saksham (disability)', () => {
    const pragati = 'AICTE - Pragati Scholarship Scheme For Girl Students (Technical Degree) 2026-27';
    expect(status(pragati, {})).toBe('unknown');
    expect(status(pragati, { gender: 'female' })).toBe('met');
    expect(status(pragati, { gender: 'male' })).toBe('unmet');
    const saksham = 'AICTE - Saksham Scholarship Scheme For Specially Abled Student (Technical Degree) 2026-27';
    expect(status(saksham, { disability: true })).toBe('met');
    expect(status(saksham, { disability: false })).toBe('unmet');
  });
  it('PM scholarships for CAPF / Railways / police wards', () => {
    const capf = "Prime Minister'S Scholarship Scheme For Central Armed Police Forces And Assam Rifles 2026-27";
    expect(status(capf, { parentService: 'capf' })).toBe('met');
    expect(status(capf, { parentService: 'none' })).toBe('unmet');
    expect(status(capf, { parentService: 'state_police' })).toBe('unmet'); // CAPF wording also says "police"
    expect(status("Prime Minister'S Scholarship Scheme For Ministry Of Railways 2026-27", { parentService: 'railways' })).toBe('met');
    const martyr = "Prime Minister'S Scholarship Scheme For Wards Of States/UTs Police Personnel Martyred During Terror/Naxal Attacks 2026-27";
    expect(status(martyr, { parentService: 'state_police' })).toBe('unknown'); // the "martyred" condition stays with the student
    expect(status(martyr, { parentService: 'none' })).toBe('unmet');
  });
  it('central sector SC / ST / OBC schemes', () => {
    expect(status('Central Sector Scholarship Of Top Class Education For SC Students 2026-27', { socialCategory: 'sc' })).toBe('met');
    expect(status('Central Sector Scholarship Of Top Class Education For SC Students 2026-27', { socialCategory: 'general' })).toBe('unmet');
    expect(status('National Fellowship And Scholarship For Higher Education Of ST Students', { socialCategory: 'st' })).toBe('met');
    const yasasvi = 'PM YASASVI Central Sector Scheme Of Top Class Education In College For OBC, EBC And DNT Student';
    expect(status(yasasvi, { socialCategory: 'obc' })).toBe('met');
    expect(status(yasasvi, { socialCategory: 'general' })).toBe('unknown'); // EBC / DNT can't be ruled out
    expect(status('Free Coaching For Scs OBCs And Beneficiaries Of PM Cares Children Scheme 2026-27', { socialCategory: 'sc' })).toBe('met');
  });
  it('leaves names without a known group as a self-declared check', () => {
    expect(evaluateAudience('AICTE - Swanath Scholarship Scheme (Technical Degree) 2026-27', {})).toBeNull();
    expect(evaluateAudience('B.Sc students in Physics', {})).toBeNull(); // "B.Sc" is not "SC"
  });
  it('explicit rule kinds for new listings', () => {
    const rules = [
      { key: 'g', kind: 'gender_in', label: 'Women only', values: ['female'] },
      { key: 'c', kind: 'category_in', label: 'SC/ST', values: ['sc', 'st'] },
      { key: 'd', kind: 'disability_required', label: 'PwD' },
      { key: 'm', kind: 'minority_required', label: 'Minority' },
      { key: 'p', kind: 'parent_service_in', label: 'Defence wards', values: ['defence'] },
      { key: 'f', kind: 'first_generation_required', label: 'First generation' },
    ];
    const r = checkEligibility({ verificationStatus: 'verified', eligibilityRules: rules }, { gender: 'female', socialCategory: 'st', disability: true, minority: false, parentService: 'defence' });
    expect(r.criteria.map((c) => c.status)).toEqual(['met', 'met', 'met', 'unmet', 'met', 'unknown']);
    expect(r.criteria.every((c) => c.private && c.studentValue === null)).toBe(true);
  });
});

let app;
beforeAll(async () => { app = await connectTestDb('private_fields'); });
afterAll(disconnectTestDb);

describe('F3: private fields in the profile', () => {
  it('saves and validates them', async () => {
    const s = await registerStudent(app);
    const u = await setProfile(app, s.token, { gender: 'female', socialCategory: 'obc', disability: false, minority: true, parentService: 'none', firstGeneration: true });
    expect(u.profile).toMatchObject({ gender: 'female', socialCategory: 'obc', disability: false, minority: true, parentService: 'none', firstGeneration: true });
    const bad = await request(app).patch('/api/profile').set(auth(s.token)).send({ profile: { socialCategory: 'brahmin' } });
    expect(bad.body.error.details[0].field).toBe('profile.socialCategory');
    const cleared = await setProfile(app, s.token, { gender: null });
    expect(cleared.profile.gender).toBeUndefined();
  });

  it('real NSP schemes stop showing "missing information" once the details are added', async () => {
    const snapshot = JSON.parse(readFileSync(new URL('../data/scraped/records.json', import.meta.url), 'utf8'));
    await ingestScrapedRecords(snapshot.records.filter((r) => /Pragati Scholarship Scheme For Girl Students \(Technical Degree\)|Saksham Scholarship Scheme For Specially Abled Student \(Technical Degree\)|Central Armed Police Forces/.test(r.title)));
    const docs = await Opportunity.find({}).lean();
    expect(docs.length).toBe(3);
    const groupRule = (o, profile) => checkEligibility(o, profile).criteria.find((c) => c.key === 'target_group').status;
    const her = { degree: 'B.Tech', currentYear: 2, gender: 'female', disability: false, parentService: 'capf' };
    const byTitle = Object.fromEntries(docs.map((o) => [o.title.split(' ').slice(0, 4).join(' '), groupRule(o, her)]));
    expect(Object.values(byTitle).sort()).toEqual(['met', 'met', 'unmet']);
    expect(docs.every((o) => groupRule(o, {}) === 'unknown')).toBe(true);
  });
});

describe('F3: never sent to the AI', () => {
  it('check_eligibility shows the model "checked privately", not the result or the value', async () => {
    const s = await registerStudent(app, { name: 'Private Person' });
    await setProfile(app, s.token, { degree: 'B.Tech', currentYear: 2, homeState: 'Kerala', annualFamilyIncomeINR: 180000, gender: 'female', socialCategory: 'sc' });
    const opp = await Opportunity.create({
      title: 'Kerala SC Girls Scholarship', organization: 'Test', opportunityType: 'scholarship', sourceUrl: 'https://example.test/k', sourceType: 'government_portal',
      verificationStatus: 'verified', lastVerifiedAt: new Date(), declaredStatus: 'open', deadline: new Date(Date.now() + 9 * 86400000), status: 'published', dedupeKey: 'k-sc-girls',
      eligibilityRules: [
        { key: 'state', kind: 'home_state_in', label: 'Domicile: Kerala', values: ['Kerala'] },
        { key: 'inc', kind: 'max_family_income', label: 'Income up to ₹2.5 lakh', numberValue: 250000 },
        { key: 'g', kind: 'gender_in', label: 'Girls', values: ['female'] },
        { key: 'c', kind: 'category_in', label: 'SC students', values: ['sc'] },
        { key: 'deg', kind: 'degree_in', label: 'B.Tech', values: ['B.Tech'] },
      ],
    });
    const user = await User.findById(s.user.id);
    const full = checkEligibility(opp.toObject(), user.profile);
    expect(full.overall).toBe('all_criteria_met');
    const forModel = eligibilityForModel(full);
    const json = JSON.stringify(forModel);
    expect(json).not.toMatch(/Kerala\)|180000|1,80,000|female|"sc"/);
    expect(forModel.privateCriteria).toBe(4);
    expect(forModel.criteria.filter((c) => c.status === 'checked_privately')).toHaveLength(4);

    const calls = [];
    setAIProvider({ model: 'fake', async respond(a) { calls.push(a); return calls.length === 1 ? { text: '', toolCalls: [{ callId: 'c', name: 'check_eligibility', arguments: JSON.stringify({ opportunity_id: String(opp._id) }) }], rawContent: {} } : { text: 'Done.', toolCalls: [] }; }, async structured() {} });
    await request(app).post('/api/ai/chat').set(auth(s.token)).send({ messages: [{ role: 'user', content: 'Am I eligible for the Kerala SC Girls Scholarship?' }] });
    const toolOutput = calls[1].input.find((m) => m.type === 'tool_result').output;
    expect(toolOutput).toContain('checked_privately');
    expect(toolOutput).not.toMatch(/Your home state \(Kerala\)|180000|stated family income/);
    setAIProvider(undefined);
  });
});
