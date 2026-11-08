import { describe, expect, it } from 'vitest';
import { LANGUAGES, translate } from './index';
import { en } from './en';
import { hi } from './hi';

describe('F9: interface languages', () => {
  it('translates with variables and falls back to English', () => {
    expect(translate('hi', 'nav.home')).toBe('होम');
    expect(translate('hi', 'home.fitYou', { n: 3 })).toBe('3 आपके लिए सही');
    expect(translate('en', 'onboarding.step', { n: 2, total: 4 })).toBe('Step 2 of 4');
    const missing = (Object.keys(en) as (keyof typeof en)[]).find((k) => !(k in hi));
    if (missing) expect(translate('hi', missing)).toBe(en[missing]);
  });
  it('Hindi covers every core key, with the same {placeholders}', () => {
    for (const [k, v] of Object.entries(hi)) {
      const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
      expect(vars(v!), k).toBe(vars(en[k as keyof typeof en]));
    }
    expect(Object.keys(hi).length).toBe(Object.keys(en).length);
    expect(LANGUAGES.map((l) => l.code)).toEqual(['en', 'hi']);
  });
});
