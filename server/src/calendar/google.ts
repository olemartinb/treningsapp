// Google OAuth (read-only calendar scope) and a minimal Calendar API client.
// The refresh token is stored in D1; the browser only ever sees our own /api routes.
import { kvGet, kvSet } from '../db.js';
import { addDays, type IsoDate } from '../dates.js';
import type { Env } from '../env.js';
import type { CalEvent } from './kidWeeks.js';

const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/calendar/v3';
const REFRESH_KEY = 'google.refresh_token';
const STATE_PREFIX = 'google.oauth_state:';
const STATE_TTL_MS = 10 * 60_000;

export class GoogleNotConnectedError extends Error {
  constructor() {
    super('Google Calendar is not connected');
  }
}

// Per-isolate caches; safe to lose at any time.
let access: { token: string; expiresAt: number } | null = null;
const calendarIds = new Map<string, string>();

function resetCaches() {
  access = null;
  calendarIds.clear();
}

export class GoogleCalendar {
  constructor(
    private db: D1Database,
    private env: Pick<Env, 'GOOGLE_CLIENT_ID' | 'GOOGLE_CLIENT_SECRET'>,
    /** Origin the app is served from; the OAuth redirect goes back here. */
    private origin: string,
  ) {}

  get configured() {
    return Boolean(this.env.GOOGLE_CLIENT_ID && this.env.GOOGLE_CLIENT_SECRET);
  }

  async connected() {
    return (await kvGet(this.db, REFRESH_KEY)) !== null;
  }

  private get redirectUri() {
    return `${this.origin}/api/auth/google/callback`;
  }

  async authUrl(): Promise<string> {
    const state = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
    await kvSet(this.db, STATE_PREFIX + state, String(Date.now() + STATE_TTL_MS));
    const params = new URLSearchParams({
      client_id: this.env.GOOGLE_CLIENT_ID ?? '',
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return `${AUTH_URL}?${params}`;
  }

  async handleCallback(code: string, state: string) {
    const expires = Number(await kvGet(this.db, STATE_PREFIX + state));
    await kvSet(this.db, STATE_PREFIX + state, null);
    if (!expires || expires < Date.now()) throw new Error('Invalid or expired OAuth state');
    const tokens = await this.tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: this.redirectUri });
    if (!tokens.refresh_token) throw new Error('Google did not return a refresh token');
    await kvSet(this.db, REFRESH_KEY, tokens.refresh_token);
    resetCaches();
    setAccess(tokens);
  }

  async disconnect() {
    await kvSet(this.db, REFRESH_KEY, null);
    resetCaches();
  }

  /** Calendar id for a calendar name, looked up via calendarList (never hardcoded). */
  async calendarIdByName(name: string): Promise<string> {
    const cached = calendarIds.get(name);
    if (cached) return cached;
    let pageToken: string | undefined;
    do {
      const page = await this.get<{ items: { id: string; summary: string; summaryOverride?: string }[]; nextPageToken?: string }>(
        '/users/me/calendarList',
        { maxResults: '250', ...(pageToken ? { pageToken } : {}) },
      );
      for (const c of page.items) calendarIds.set(c.summaryOverride ?? c.summary, c.id);
      pageToken = page.nextPageToken;
    } while (pageToken);
    const id = calendarIds.get(name);
    if (!id) throw new Error(`Calendar "${name}" not found`);
    return id;
  }

  /** Events overlapping [from, to] (inclusive dates), recurring events expanded. */
  async listEvents(calendarName: string, from: IsoDate, to: IsoDate): Promise<CalEvent[]> {
    const calendarId = await this.calendarIdByName(calendarName);
    const items: CalEvent[] = [];
    let pageToken: string | undefined;
    do {
      const page = await this.get<{ items: CalEvent[]; nextPageToken?: string }>(
        `/calendars/${encodeURIComponent(calendarId)}/events`,
        {
          // Pad a day on each side so UTC vs. Oslo midnight never drops an event.
          timeMin: `${addDays(from, -1)}T00:00:00Z`,
          timeMax: `${addDays(to, 2)}T00:00:00Z`,
          singleEvents: 'true',
          orderBy: 'startTime',
          maxResults: '2500',
          fields: 'items(id,summary,status,start,end),nextPageToken',
          ...(pageToken ? { pageToken } : {}),
        },
      );
      items.push(...page.items);
      pageToken = page.nextPageToken;
    } while (pageToken);
    return items;
  }

  private async get<T>(path: string, query: Record<string, string>): Promise<T> {
    const res = await fetch(`${API}${path}?${new URLSearchParams(query)}`, {
      headers: { Authorization: `Bearer ${await this.accessToken()}` },
    });
    if (res.status === 401) access = null;
    if (!res.ok) throw new Error(`Google Calendar ${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
  }

  private async accessToken(): Promise<string> {
    if (access && access.expiresAt > Date.now() + 60_000) return access.token;
    const refresh = await kvGet(this.db, REFRESH_KEY);
    if (!refresh) throw new GoogleNotConnectedError();
    try {
      return setAccess(await this.tokenRequest({ refresh_token: refresh, grant_type: 'refresh_token' }));
    } catch (err) {
      // A revoked/expired refresh token means the user has to connect again.
      if (err instanceof Error && err.message.includes('invalid_grant')) {
        await this.disconnect();
        throw new GoogleNotConnectedError();
      }
      throw err;
    }
  }

  private async tokenRequest(body: Record<string, string>) {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.env.GOOGLE_CLIENT_ID ?? '',
        client_secret: this.env.GOOGLE_CLIENT_SECRET ?? '',
        ...body,
      }),
    });
    if (!res.ok) throw new Error(`Google token ${res.status}: ${await res.text()}`);
    return (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string };
  }
}

function setAccess(t: { access_token: string; expires_in: number }): string {
  access = { token: t.access_token, expiresAt: Date.now() + t.expires_in * 1000 };
  return access.token;
}
