import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { connectTestDb, disconnectTestDb, registerStudent, auth } from './helpers.js';
import { setAIProvider } from '../src/ai/provider.js';
import { isOffTopic, containsCode } from '../src/ai/scope.js';
import { Resource } from '../src/models/Resource.js';

let app;
let s;
beforeAll(async () => {
  app = await connectTestDb('scope');
  s = await registerStudent(app);
  await Resource.create({ title: 'CS50x', provider: 'Harvard', url: 'https://cs50.harvard.edu/x/', skills: ['programming', 'computer science', 'c'], verifiedAt: new Date() });
});
afterEach(() => setAIProvider(undefined));
afterAll(disconnectTestDb);

describe('L8: Sarthi stays in scope', () => {
  it('flags coding and homework requests, not career questions', () => {
    for (const m of ['Write linked list code in C', 'implement a binary tree in Java', 'Can you debug my python function?', 'Solve this question: 2x + 3 = 7', 'Write an essay on pollution', 'give me leetcode solution for two sum']) {
      expect(isOffTopic(m), m).toBe(true);
    }
    for (const m of ['Find machine learning internships', 'Which internships need Python?', 'How should I learn DSA for placements?', 'What should I do next?', 'Write a cover letter for the Google internship', 'Am I eligible for this scholarship?', 'Which coding hackathons are open?']) {
      expect(isOffTopic(m), m).toBe(false);
    }
  });

  it('chat redirects without calling the model, pointing to verified resources', async () => {
    const calls = [];
    setAIProvider({ model: 'fake', async respond(a) { calls.push(a); return { text: 'should not be called', toolCalls: [] }; }, async structured() {} });
    const res = await request(app).post('/api/ai/chat').set(auth(s.token)).send({ messages: [{ role: 'user', content: 'Write linked list code in C' }] });
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(0);
    expect(res.body.data.toolsUsed).toEqual(['scope_guard']);
    expect(res.body.data.reply).toMatch(/don't write code/);
    expect(res.body.data.reply).toMatch(/CS50x/);
    expect(res.body.data.reply).not.toMatch(/struct|malloc|```/);
  });

  it('a reply that contains code anyway is replaced', async () => {
    setAIProvider({ model: 'fake', async respond() { return { text: 'Sure!\n```c\nstruct Node { int v; };\n```', toolCalls: [] }; }, async structured() {} });
    const res = await request(app).post('/api/ai/chat').set(auth(s.token)).send({ messages: [{ role: 'user', content: 'How do nodes work?' }] });
    expect(res.body.data.reply).not.toMatch(/```|struct Node/);
    expect(res.body.data.reply).toMatch(/opportunities, eligibility, applications and career planning/);
    expect(containsCode('Apply before 30 Nov.')).toBe(false);
  });

  it('quick answers redirect too', async () => {
    const res = await request(app).post('/api/ai/quick').set(auth(s.token)).send({ message: 'Write linked list code in C' });
    expect(res.body.data.toolsUsed).toEqual(['quick:scope']);
    expect(res.body.data.reply).toMatch(/CS50x/);
  });
});
