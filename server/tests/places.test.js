import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { connectTestDb, disconnectTestDb, registerStudent, auth, setProfile, createOpportunity } from './helpers.js';
import { matchesPlace, placeLabel, proximity, PROXIMITY, userPlaces } from '../src/matching/places.js';

const inPerson = (city) => ({ workMode: 'onsite', location: { city, description: `${city}, India` } });
const online = { workMode: 'remote', location: { description: 'Online', isNationwide: true } };

describe('proximity', () => {
  it('treats old names, suburbs and Delhi NCR as the same city', () => {
    expect(proximity(inPerson('Bengaluru'), ['Bangalore'])).toBe(PROXIMITY.SAME_CITY);
    expect(proximity(inPerson('Soladevanahalli'), ['Bengaluru'])).toBe(PROXIMITY.SAME_CITY);
    expect(proximity(inPerson('Bidhannagar'), ['Kolkata'])).toBe(PROXIMITY.SAME_CITY);
    expect(proximity(inPerson('Gurugram'), ['Noida'])).toBe(PROXIMITY.SAME_CITY);
  });
  it('matches the state from a city or a state name', () => {
    expect(proximity(inPerson('Nagpur'), ['Pune'])).toBe(PROXIMITY.SAME_STATE);
    expect(proximity(inPerson('Patiala'), ['Punjab'])).toBe(PROXIMITY.SAME_STATE);
  });
  it('ranks online ahead of far-away in-person events, and never calls either near', () => {
    expect(proximity(online, ['Pune'])).toBe(PROXIMITY.ONLINE);
    expect(proximity(inPerson('Kolkata'), ['Pune'])).toBe(PROXIMITY.ELSEWHERE);
    expect(proximity(inPerson('Kolkata'), [])).toBe(PROXIMITY.ELSEWHERE);
  });
  it('does not treat a listing without a city as near', () => {
    expect(proximity({ workMode: 'onsite', location: { description: 'India' } }, ['Pune'])).toBe(PROXIMITY.ELSEWHERE);
  });
});

describe('location helpers', () => {
  it('filters by alias and state, strictly when asked', () => {
    expect(matchesPlace(inPerson('Bengaluru'), 'Bangalore')).toBe(true);
    expect(matchesPlace(inPerson('Mysuru'), 'Karnataka')).toBe(true);
    expect(matchesPlace(inPerson('Pune'), 'Karnataka')).toBe(false);
    expect(matchesPlace(online, 'Pune')).toBe(true);
    expect(matchesPlace(online, 'Pune', { strict: true })).toBe(false);
  });
  it('labels only in-person listings with a named city', () => {
    expect(placeLabel(inPerson('Gurugram'))).toBe('Delhi NCR');
    expect(placeLabel(online)).toBeNull();
    expect(placeLabel({ workMode: 'onsite', location: { description: 'India' } })).toBeNull();
  });
  it('ignores places that are not real locations', () => {
    expect(userPlaces({ profile: { preferredLocations: ['Remote', 'Pune'], homeState: 'Maharashtra' } })).toEqual(['Pune', 'Maharashtra']);
  });
});

describe('hackathon filters through the API', () => {
  let app; let s;
  const titles = (r) => r.body.data.map((o) => o.title);
  beforeAll(async () => {
    app = await connectTestDb('places');
    s = await registerStudent(app);
    await setProfile(app, s.token, { preferredLocations: ['Pune'] });
    const soon = (d) => new Date(Date.now() + d * 86400000);
    await createOpportunity({ title: 'Far Hack', opportunityType: 'hackathon', deadline: soon(1), workMode: 'onsite', location: { city: 'Kolkata', description: 'Kolkata, India' } });
    await createOpportunity({ title: 'Online Hack', opportunityType: 'hackathon', deadline: soon(2), workMode: 'remote', location: { description: 'Online', isNationwide: true }, award: { description: 'Prizes: $500' } });
    await createOpportunity({ title: 'State Hack', opportunityType: 'hackathon', deadline: soon(3), workMode: 'onsite', location: { city: 'Nagpur', description: 'Nagpur, India' } });
    await createOpportunity({ title: 'Pune Hack', opportunityType: 'hackathon', deadline: soon(9), workMode: 'onsite', location: { city: 'Pune', description: 'Pune, India' } });
  });
  afterAll(disconnectTestDb);

  it('sorts nearest first regardless of deadline, and marks what is near', async () => {
    const r = await request(app).get('/api/opportunities?type=hackathon&sort=nearby').set(auth(s.token));
    expect(titles(r)).toEqual(['Pune Hack', 'State Hack', 'Online Hack', 'Far Hack']);
    expect(r.body.data.map((o) => o.nearby)).toEqual(['city', 'state', null, null]);
    expect(r.body.meta.nearby).toEqual({ places: ['Pune'], count: 2 });
  });
  it('a chosen city shows events there, without the online ones', async () => {
    const r = await request(app).get('/api/opportunities?type=hackathon&location=Kolkata').set(auth(s.token));
    expect(titles(r)).toEqual(['Far Hack']);
  });
  it('filters by prizes', async () => {
    const r = await request(app).get('/api/opportunities?type=hackathon&hasPrize=true').set(auth(s.token));
    expect(titles(r)).toEqual(['Online Hack']);
  });
  it('lists cities with in-person events', async () => {
    const r = await request(app).get('/api/opportunities/places?type=hackathon').set(auth(s.token));
    expect(r.status).toBe(200);
    expect(r.body.data.map((p) => p.city).sort()).toEqual(['Kolkata', 'Nagpur', 'Pune']);
  });
});
