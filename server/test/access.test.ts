import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AccessError, accessToken, verifyAccessJwt } from '../src/access.js';

const TEAM = 'olemartin.cloudflareaccess.com';
const AUD = 'aud-tag-123';
const NOW = Date.parse('2026-10-30T06:00:00Z');

let keys: CryptoKeyPair;
let otherKeys: CryptoKeyPair;

const b64url = (data: Uint8Array | string) =>
  Buffer.from(typeof data === 'string' ? new TextEncoder().encode(data) : data).toString('base64url');

async function sign(claims: Record<string, unknown>, key = keys.privateKey, kid = 'k1') {
  const head = b64url(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }));
  const body = b64url(JSON.stringify(claims));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(new Uint8Array(sig))}`;
}

const valid = { aud: [AUD], iss: `https://${TEAM}`, exp: NOW / 1000 + 600, sub: 'u1', email: 'me@example.com' };
const config = { teamDomain: TEAM, aud: AUD };

beforeAll(async () => {
  const alg = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
  keys = (await crypto.subtle.generateKey(alg, true, ['sign', 'verify'])) as CryptoKeyPair;
  otherKeys = (await crypto.subtle.generateKey(alg, true, ['sign', 'verify'])) as CryptoKeyPair;
  const jwk = { ...(await crypto.subtle.exportKey('jwk', keys.publicKey)), kid: 'k1' };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      url === `https://${TEAM}/cdn-cgi/access/certs` ? Response.json({ keys: [jwk] }) : new Response('nope', { status: 404 }),
    ),
  );
});
afterEach(() => vi.clearAllMocks());

describe('verifyAccessJwt', () => {
  it('accepts a valid token', async () => {
    await expect(verifyAccessJwt(await sign(valid), config, NOW)).resolves.toEqual({ email: 'me@example.com', sub: 'u1' });
  });

  it('accepts the team domain with a scheme', async () => {
    await expect(verifyAccessJwt(await sign(valid), { ...config, teamDomain: `https://${TEAM}/` }, NOW)).resolves.toBeTruthy();
  });

  it.each([
    ['wrong audience', { ...valid, aud: ['other'] }],
    ['wrong issuer', { ...valid, iss: 'https://evil.cloudflareaccess.com' }],
    ['expired', { ...valid, exp: NOW / 1000 - 1 }],
  ])('rejects %s', async (_name, claims) => {
    await expect(verifyAccessJwt(await sign(claims), config, NOW)).rejects.toBeInstanceOf(AccessError);
  });

  it('rejects a token signed by another key', async () => {
    await expect(verifyAccessJwt(await sign(valid, otherKeys.privateKey), config, NOW)).rejects.toThrow('Bad signature');
  });

  it('rejects an unknown key id', async () => {
    await expect(verifyAccessJwt(await sign(valid, keys.privateKey, 'k2'), config, NOW)).rejects.toThrow('Unknown signing key');
  });

  it('rejects garbage', async () => {
    await expect(verifyAccessJwt('a.b', config, NOW)).rejects.toBeInstanceOf(AccessError);
  });
});

describe('accessToken', () => {
  it('reads the header first, then the cookie', () => {
    expect(accessToken(new Headers({ 'Cf-Access-Jwt-Assertion': 'h' }))).toBe('h');
    expect(accessToken(new Headers({ Cookie: 'a=1; CF_Authorization=c; b=2' }))).toBe('c');
    expect(accessToken(new Headers())).toBeNull();
  });
});
