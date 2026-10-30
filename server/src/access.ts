// Verifies the Cloudflare Access JWT on every API request. Access itself blocks
// unauthenticated users at the edge; this guards against the Worker being reached
// any other way (e.g. a workers.dev route without Access) and fails closed.

export interface AccessConfig {
  teamDomain: string;
  aud: string;
}

export interface AccessIdentity {
  email: string | null;
  sub: string;
}

export class AccessError extends Error {}

interface Jwk extends JsonWebKey {
  kid: string;
}

const CERTS_TTL_MS = 60 * 60_000;
let certsCache: { domain: string; at: number; keys: Jwk[] } | null = null;

function b64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

const decodeJson = (s: string) => JSON.parse(new TextDecoder().decode(b64urlDecode(s)));

const normalizeDomain = (d: string) => d.replace(/^https?:\/\//, '').replace(/\/$/, '');

async function signingKeys(teamDomain: string, forceRefresh: boolean): Promise<Jwk[]> {
  if (!forceRefresh && certsCache?.domain === teamDomain && Date.now() - certsCache.at < CERTS_TTL_MS) return certsCache.keys;
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new AccessError(`Could not fetch Access certs (${res.status})`);
  const { keys } = (await res.json()) as { keys: Jwk[] };
  certsCache = { domain: teamDomain, at: Date.now(), keys };
  return keys;
}

export async function verifyAccessJwt(token: string, config: AccessConfig, now = Date.now()): Promise<AccessIdentity> {
  const teamDomain = normalizeDomain(config.teamDomain);
  const parts = token.split('.');
  if (parts.length !== 3) throw new AccessError('Malformed token');
  const [h, p, s] = parts as [string, string, string];

  const header = decodeJson(h) as { alg?: string; kid?: string };
  if (header.alg !== 'RS256' || !header.kid) throw new AccessError('Unsupported token');

  let jwk = (await signingKeys(teamDomain, false)).find((k) => k.kid === header.kid);
  // Access rotates keys; refetch once on an unknown kid.
  jwk ??= (await signingKeys(teamDomain, true)).find((k) => k.kid === header.kid);
  if (!jwk) throw new AccessError('Unknown signing key');

  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlDecode(s), new TextEncoder().encode(`${h}.${p}`));
  if (!valid) throw new AccessError('Bad signature');

  const claims = decodeJson(p) as { aud?: string | string[]; iss?: string; exp?: number; nbf?: number; sub?: string; email?: string };
  const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!auds.includes(config.aud)) throw new AccessError('Wrong audience');
  if (claims.iss !== `https://${teamDomain}`) throw new AccessError('Wrong issuer');
  const seconds = now / 1000;
  if (!claims.exp || claims.exp < seconds) throw new AccessError('Token expired');
  if (claims.nbf && claims.nbf > seconds + 60) throw new AccessError('Token not yet valid');

  return { email: claims.email ?? null, sub: claims.sub ?? '' };
}

/** Token from the header Access adds, or from its cookie. */
export function accessToken(headers: Headers): string | null {
  const header = headers.get('Cf-Access-Jwt-Assertion');
  if (header) return header;
  const cookie = headers.get('Cookie') ?? '';
  return /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(cookie)?.[1] ?? null;
}
