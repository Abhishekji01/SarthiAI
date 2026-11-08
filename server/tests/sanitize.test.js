import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { connectTestDb, disconnectTestDb, registerStudent, auth } from './helpers.js';
import { plainLine, plainText } from '../src/utils/sanitize.js';
import { simpleEmail } from '../src/mail/mailer.js';

let app;
beforeAll(async () => { app = await connectTestDb('sanitize'); });
afterAll(disconnectTestDb);

describe('L9: no raw HTML or control characters in stored text', () => {
  it('strips tags and control characters, keeps ordinary "<"', () => {
    expect(plainLine('  <img src=x onerror=alert(1)>Isha\u0000 Sharma‮ ')).toBe('Isha Sharma');
    expect(plainLine('<script>alert(1)</script>Ravi')).toBe('alert(1) Ravi');
    expect(plainLine('Marks < 60% and > 40%')).toBe('Marks < 60% and > 40%');
    expect(plainText('Line one\r\n<b>Line</b> two\n\n\n\nEnd')).toBe('Line one\n Line two\n\nEnd');
  });

  it('sign-up and profile names are cleaned before saving', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: '<img src=x onerror=alert(1)> Isha Sharma', email: 'xss@example.test', password: 'a-long-passphrase' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.name).toBe('Isha Sharma');
    const p = await request(app).patch('/api/profile').set(auth(res.body.data.token)).send({ name: 'Isha\u0007 <b>S.</b>', profile: { careerGoal: '<a href="x">Security</a> analyst', skills: ['<i>Python</i>'] } });
    expect(p.body.data.user.name).toBe('Isha S.');
    expect(p.body.data.user.profile.careerGoal).toBe('Security analyst');
    expect(p.body.data.user.profile.skills).toEqual(['Python']);
  });

  it('a name that is only markup is rejected as empty', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: '<img src=x onerror=alert(1)>', email: 'xss2@example.test', password: 'a-long-passphrase' });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0]).toMatchObject({ field: 'name', message: 'Name is required' });
  });

  it('email templates escape whatever is in a name', () => {
    const { html } = simpleEmail({ greetingName: '<b>Isha</b>', paragraphs: ['x & y'], action: { label: 'Go', url: 'https://example.test/?a=1&b="2"' } });
    expect(html).toContain('Hi &lt;b&gt;Isha&lt;/b&gt;,');
    expect(html).toContain('x &amp; y');
    expect(html).not.toContain('<b>Isha</b>');
  });
});
