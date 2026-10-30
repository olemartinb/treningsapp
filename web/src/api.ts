// Typed client for the backend. Types come straight from the server modules (type-only imports).
import type { DayInfo, WeekType } from '../../server/src/calendar/kidWeeks';
import type { PeriodWithTarget, Race } from '../../server/src/calendar/service';
import type { DailyLog, DailyLogPatch } from '../../server/src/log/types';
import type { Activity, Wellness } from '../../server/src/intervals/types';
import type { KneeFlag } from '../../server/src/training/knee';
import type { PeriodVolume } from '../../server/src/training/volume';
import type { Week, WeekDay } from '../../server/src/training/week';
import type { PlanDay, PlanPeriod } from '../../server/src/plan/overview';
import type { PlannedSession, SessionKind, SessionPatch } from '../../server/src/plan/types';

export { isRun, paceSecPerKm } from '../../server/src/intervals/types';
export type { Activity, DailyLog, DayInfo, KneeFlag, PeriodVolume, PeriodWithTarget, PlanDay, PlanPeriod, PlannedSession, Race, SessionKind, SessionPatch, Week, WeekDay, WeekType, Wellness };

export interface Training {
  configured: boolean;
  lastSyncAt: string | null;
  cachedActivities: number;
  hiddenActivities: number;
  activities: (Activity & { kneeFlag: KneeFlag | null })[];
  fitness: Wellness | null;
  volume: PeriodVolume | null;
}

export interface Today {
  date: string;
  log: DailyLog;
  weight: { last: { date: string; weightKg: number } | null; avg7: number | null; count7: number };
  training: Training;
  planned: PlannedSession[];
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
  const body = res.status === 204 ? {} : await res.json().catch(() => ({}));
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
  week: (start: string) => request<Week>(`/api/week?start=${start}`),
  plan: (weeks = 8) => request<{ today: string; periods: PlanPeriod[] }>(`/api/plan?weeks=${weeks}`),
  createSession: (session: SessionPatch & { date: string; kind: SessionKind }) =>
    request<PlannedSession>('/api/plan/sessions', { method: 'POST', body: JSON.stringify(session) }),
  updateSession: (id: number, patch: SessionPatch) =>
    request<PlannedSession>(`/api/plan/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteSession: (id: number) => request<void>(`/api/plan/sessions/${id}`, { method: 'DELETE' }),
  fillPeriod: (periodStart: string) =>
    request<{ created: PlannedSession[] }>('/api/plan/fill', { method: 'POST', body: JSON.stringify({ periodStart }) }),
  activities: (from: string, to: string) => request<{ activities: Activity[] }>(`/api/activities?from=${from}&to=${to}`),
};
