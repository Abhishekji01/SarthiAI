import { describe, expect, it } from 'vitest';
import { resolveBaseUrl, shouldAttachToken, validateServerUrl } from './serverConfig';

const prod = { overrideAllowed: false };
const dev = { overrideAllowed: true };

describe('server URL rules (H1)', () => {
  it('ignores and deletes any stored override in production builds', () => {
    expect(resolveBaseUrl('https://example.com', '', prod)).toEqual({ baseUrl: '', clearStored: true });
    expect(resolveBaseUrl('https://evil.example', 'https://api.sarthi.in', prod)).toEqual({ baseUrl: 'https://api.sarthi.in', clearStored: true });
  });
  it('keeps a valid override in dev builds and drops an invalid one', () => {
    expect(resolveBaseUrl('https://staging.example.com/', '', dev)).toEqual({ baseUrl: 'https://staging.example.com', clearStored: false });
    expect(resolveBaseUrl('http://example.com', '', dev)).toEqual({ baseUrl: '', clearStored: true });
    expect(resolveBaseUrl(null, '', dev)).toEqual({ baseUrl: '', clearStored: false });
  });
  it('requires https, except emulator/localhost addresses in dev', () => {
    expect(validateServerUrl('https://api.example.com', prod)).toBeNull();
    expect(validateServerUrl('http://api.example.com', dev)).toMatch(/https/);
    expect(validateServerUrl('http://10.0.2.2:4000', dev)).toBeNull();
    expect(validateServerUrl('http://localhost:4000', dev)).toBeNull();
    expect(validateServerUrl('http://10.0.2.2:4000', prod)).toMatch(/https/);
    expect(validateServerUrl('https://user:pw@example.com', dev)).toMatch(/username/);
    expect(validateServerUrl('https://example.com/api', dev)).toMatch(/only the server address/);
    expect(validateServerUrl('not a url', dev)).toMatch(/valid URL/);
  });
  it('only sends the session token to the default server in production builds', () => {
    expect(shouldAttachToken('', '', prod)).toBe(true);
    expect(shouldAttachToken('https://api.sarthi.in', 'https://api.sarthi.in/', prod)).toBe(true);
    expect(shouldAttachToken('https://evil.example', 'https://api.sarthi.in', prod)).toBe(false);
    expect(shouldAttachToken('https://evil.example', '', prod)).toBe(false);
    expect(shouldAttachToken('https://staging.example.com', '', dev)).toBe(true);
  });
});
