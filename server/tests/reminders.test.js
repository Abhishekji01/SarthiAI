import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { connectTestDb, disconnectTestDb, registerStudent, auth, createOpportunity, makeAdmin } from './helpers.js';
import { deadlineIcs, googleCalendarUrl } from '../src/notify/ics.js';
import { outbox } from '../src/mail/mailer.js';
import { runDeadlineReminders, runWeeklyDigest, runDateWatches, unsubscribeUrl, isoWeek } from '../src/notify/jobs.js';
import { User } from '../src/models/User.js';
import { SavedOpportunity } from '../src/models/SavedOpportunity.js';

let app;
beforeAll(async () => { app = await connectTestDb('reminders'); });
afterAll(disconnectTestDb);

const verified = async (overrides) => {
  const s = await registerStudent(app, overrides);
  await User.updateOne({ _id: s.user.id }, { $set: { emailVerifiedAt: new Date(), onboardingCompletedAt: new Date() } });
  return s;
};
const mails = (email, kind) => outbox.filter((m) => m.to === email && m.kind === kind);

describe('F5: calendar export', () => {
  const opp = { _id: 'abc123', title: 'Pragati Scholarship, 2026; Girls', organization: 'AICTE', sourceUrl: 'https://www.aicte.gov.in/schemes', deadline: new Date('2026-11-30T18:29:00Z') };
  it('builds an all-day .ics on the India date with two reminders', () => {
    const ics = deadlineIcs(opp, { url: 'https://app.example/opportunity/abc123', now: new Date('2026-11-07T00:00:00Z') });
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261130\r\n');
    expect(ics).toContain('DTEND;VALUE=DATE:20261201\r\n');
    expect(ics).toContain('SUMMARY:Deadline: Pragati Scholarship\\, 2026\; Girls');
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(2);
    expect(ics).toContain('TRIGGER:-P3D');
    for (const line of ics.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    expect(deadlineIcs({ ...opp, deadline: null })).toBeNull();
  });
  it('builds an Add to Google Calendar link', () => {
    const u = new URL(googleCalendarUrl(opp));
    expect(u.searchParams.get('dates')).toBe('20261130/20261201');
    expect(u.searchParams.get('text')).toBe('Deadline: Pragati Scholarship, 2026; Girls');
  });
  it('serves .ics for signed-in students and for public listings', async () => {
    const o = await createOpportunity({ title: 'ICS Test' });
    const s = await registerStudent(app);
    const r = await request(app).get(`/api/opportunities/${o._id}/calendar.ics`).set(auth(s.token));
    expect(r.headers['content-type']).toMatch(/text\/calendar/);
    expect(r.text).toContain('SUMMARY:Deadline: ICS Test');
    expect((await request(app).get(`/api/public/opportunities/${o._id}/calendar.ics`)).status).toBe(200);
  });
});

describe('F5: deadline emails', () => {
  it('emails "closes in N days" once, only to verified addresses', async () => {
    const o = await createOpportunity({ title: 'Closing Soon Fellowship', deadline: new Date(Date.now() + 2 * 86400000) });
    const v = await verified();
    const u = await registerStudent(app); // not verified
    for (const s of [v, u]) await SavedOpportunity.create({ userId: s.user.id, opportunityId: o._id });
    await runDeadlineReminders();
    await runDeadlineReminders(); // second run sends nothing new
    expect(mails(v.email, 'deadline_reminder')).toHaveLength(1);
    expect(mails(v.email, 'deadline_reminder')[0].subject).toBe('Closes in 2 days: Closing Soon Fellowship');
    expect(mails(u.email, 'deadline_reminder')).toHaveLength(0);
  });
  it('respects the email preference and the one-click unsubscribe link', async () => {
    const o = await createOpportunity({ title: 'Unsub Test', deadline: new Date(Date.now() + 1 * 86400000) });
    const v = await verified();
    await SavedOpportunity.create({ userId: v.user.id, opportunityId: o._id });
    const link = new URL(unsubscribeUrl({ _id: v.user.id }, 'deadlines'));
    const page = await request(app).get(`${link.pathname}${link.search}`);
    expect(page.status).toBe(200);
    expect(page.text).toContain('Unsubscribed');
    expect((await User.findById(v.user.id).lean()).notificationPrefs.emailDeadlines).toBe(false);
    await runDeadlineReminders();
    expect(mails(v.email, 'deadline_reminder')).toHaveLength(0);
    expect((await request(app).get('/api/public/unsubscribe?token=forged')).status).toBe(400);
  });
});

describe('F5: weekly digest', () => {
  it('goes out on Monday morning (India time), once per week, skipped when empty', async () => {
    const o = await createOpportunity({ title: 'Digest Internship', deadline: new Date(Date.now() + 5 * 86400000) });
    const v = await verified();
    await SavedOpportunity.create({ userId: v.user.id, opportunityId: o._id });
    const tuesday = new Date('2026-11-10T05:00:00Z');
    expect((await runWeeklyDigest(tuesday)).skipped).toBeTruthy();
    const monday = new Date(Date.now());
    const r1 = await runWeeklyDigest(monday, { force: true });
    await runWeeklyDigest(monday, { force: true });
    expect(r1.week).toBe(isoWeek(monday));
    const sent = mails(v.email, 'weekly_digest');
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain('Digest Internship');
    expect(sent[0].text).toMatch(/Stop weekly emails: http/);
  });
});

describe('F5: notify me when dates are announced', () => {
  it('fires once when an admin publishes the deadline, and saves the listing', async () => {
    const o = await createOpportunity({ title: 'Dates TBA Scholarship', deadline: null, declaredStatus: 'upcoming' });
    const v = await verified();
    const w = await request(app).post(`/api/opportunities/${o._id}/watch`).set(auth(v.token));
    expect(w.body.data).toMatchObject({ watchingDates: true, isSaved: true });
    expect((await request(app).get(`/api/opportunities/${o._id}`).set(auth(v.token))).body.data.watchingDates).toBe(true);
    const admin = await makeAdmin(app, { platform: true });
    const deadline = new Date(Date.now() + 20 * 86400000).toISOString();
    expect((await request(app).patch(`/api/admin/opportunities/${o._id}`).set(auth(admin.token)).send({ deadline })).status).toBe(200);
    await new Promise((r) => setTimeout(r, 100));
    await runDateWatches();
    const sent = mails(v.email, 'dates_announced');
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe('Dates announced: Dates TBA Scholarship');
    expect((await request(app).get(`/api/opportunities/${o._id}`).set(auth(v.token))).body.data.watchingDates).toBe(false);
  });
  it('refuses a watch when a deadline already exists', async () => {
    const o = await createOpportunity({ title: 'Has Date' });
    const s = await registerStudent(app);
    expect((await request(app).post(`/api/opportunities/${o._id}/watch`).set(auth(s.token))).status).toBe(400);
  });
});

describe('F5: internal jobs endpoint', () => {
  it('does not exist without JOBS_SECRET', async () => {
    expect((await request(app).post('/api/internal/jobs')).status).toBe(404);
  });
});
