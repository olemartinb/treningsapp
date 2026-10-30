// Google OAuth (read-only calendar scope) and a minimal Calendar API client.
// The refresh token is stored in SQLite; the browser only ever sees our own /api routes.
import crypto from 'node:crypto';
import { config } from '../config.js';
import { kvGet, kvSet, type DB } from '../db.js';
import { addDays, type IsoDate } from '../dates.js';
import type { CalEvent } from './kidWeeks.js';

const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/calendar/v3';
const REFRESH_KEY = 'google.refresh_token';

export class GoogleNotConnectedError extends Error {
  constructor() {
    super('Google Calendar is not connected');
  }
}

export const redirectUri = () => `${config.publicUrl}/api/auth/google/callback`;

export class GoogleCalendar {
  private access: { token: string; expiresAt: number } | null = null;
  private pendingStates = new Map<string, number>();
  private calendarIds = new Map<string, string>();

  constructor(private db: DB) {}

  get configured() {
    return Boolean(config.google.clientId && config.google.clientSecret);
  }

  get connected() {
    return kvGet(this.db, REFRESH_KEY) !== null;
  }

  authUrl(): string {
    const state = crypto.randomBytes(16).toString('hex');
    this.pendingStates.set(state, Date.now() + 10 * 60_000);
    const params = new URLSearchParams({
      client_id: config.google.clientId,
      redirect_uri: redirectUri(),
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return `${AUTH_URL}?${params}`;
  }

  async handleCallback(code: string, state: string) {
    const expires = this.pendingStates.get(state);
    this.pendingStates.delete(state);
    if (!expires || expires < Date.now()) throw new Error('Invalid or expired OAuth state');
    const tokens = await this.tokenRequest({
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri(),
    });
    if (!tokens.refresh_token) throw new Error('Google did not return a refresh token');
    kvSet(this.db, REFRESH_KEY, tokens.refresh_token);
    this.setAccess(tokens);
    this.calendarIds.clear();
  }

  disconnect() {
    kvSet(this.db, REFRESH_KEY, null);
    this.access = null;
    this.calendarIds.clear();
  }

  /** Calendar id for a calendar name, looked up via calendarList (never hardcoded). */
  async calendarIdByName(name: string): Promise<string> {
    const cached = this.calendarIds.get(name);
    if (cached) return cached;
    let pageToken: string | undefined;
    do {
      const page = await this.get<{ items: { id: string; summary: string; summaryOverride?: string }[]; nextPageToken?: string }>(
        '/users/me/calendarList',
        { maxResults: '250', ...(pageToken ? { pageToken } : {}) },
      );
      for (const c of page.items) this.calendarIds.set(c.summaryOverride ?? c.summary, c.id);
      pageToken = page.nextPageToken;
    } while (pageToken);
    const id = this.calendarIds.get(name);
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
    if (res.status === 401) this.access = null;
    if (!res.ok) throw new Error(`Google Calendar ${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
  }

  private async accessToken(): Promise<string> {
    if (this.access && this.access.expiresAt > Date.now() + 60_000) return this.access.token;
    const refresh = kvGet(this.db, REFRESH_KEY);
    if (!refresh) throw new GoogleNotConnectedError();
    try {
      this.setAccess(await this.tokenRequest({ refresh_token: refresh, grant_type: 'refresh_token' }));
    } catch (err) {
      // A revoked/expired refresh token means the user has to connect again.
      if (err instanceof Error && err.message.includes('invalid_grant')) {
        this.disconnect();
        throw new GoogleNotConnectedError();
      }
      throw err;
    }
    return this.access!.token;
  }

  private setAccess(t: { access_token: string; expires_in: number }) {
    this.access = { token: t.access_token, expiresAt: Date.now() + t.expires_in * 1000 };
  }

  private async tokenRequest(body: Record<string, string>) {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.google.clientId, client_secret: config.google.clientSecret, ...body }),
    });
    if (!res.ok) throw new Error(`Google token ${res.status}: ${await res.text()}`);
    return (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string };
  }
}
