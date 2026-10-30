// Typed client for the backend. Types come straight from the server modules (type-only imports).
import type { DayInfo, WeekType } from '../../server/src/calendar/kidWeeks';
import type { PeriodWithTarget, Race } from '../../server/src/calendar/service';
import type { DailyLog, DailyLogPatch } from '../../server/src/log/types';
import type { Activity, Wellness } from '../../server/src/intervals/types';
import type { KneeFlag } from '../../server/src/training/knee';
import type { PeriodVolume } from '../../server/src/training/volume';

export { isRun, paceSecPerKm } from '../../server/src/intervals/types';
export type { Activity, DailyLog, DayInfo, KneeFlag, PeriodVolume, PeriodWithTarget, Race, WeekType, Wellness };

export interface Training {
  configured: boolean;
  lastSyncAt: string | null;
  activities: (Activity & { kneeFlag: KneeFlag | null })[];
  fitness: Wellness | null;
  volume: PeriodVolume | null;
}

export interface Today {
  date: string;
  log: DailyLog;
  weight: { last: { date: string; weightKg: number } | null; avg7: number | null; count7: number };
  training: Training;
  calendar: { day: DayInfo; period: PeriodWithTarget | null; periodDays: DayInfo[] } | null;
  nextRace: (Race & { inDays: number }) | null;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error ?? res.statusText);
  return body as T;
}

export const api = {
  today: () => request<Today>('/api/today'),
  googleStatus: () => request<{ configured: boolean; connected: boolean }>('/api/auth/google/status'),
  calendarDays: (from: string, to: string, refresh = false) =>
    request<{ days: DayInfo[]; periods: PeriodWithTarget[] }>(`/api/calendar/days?from=${from}&to=${to}${refresh ? '&refresh=true' : ''}`),
  races: (from: string, to: string) => request<{ races: Race[] }>(`/api/calendar/races?from=${from}&to=${to}`),
  logs: (from: string, to: string) => request<{ logs: DailyLog[] }>(`/api/log?from=${from}&to=${to}`),
  saveLog: (date: string, patch: DailyLogPatch) =>
    request<DailyLog>(`/api/log/${date}`, { method: 'PUT', body: JSON.stringify(patch) }),
  sync: () => request<{ activities: number; wellness: number; lastSyncAt: string }>('/api/sync', { method: 'POST' }),
  activities: (from: string, to: string) => request<{ activities: Activity[] }>(`/api/activities?from=${from}&to=${to}`),
};
