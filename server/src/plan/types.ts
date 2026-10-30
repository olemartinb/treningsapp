// Planned sessions. Shared with the web app, so no Worker globals here.
import type { IsoDate } from '../dates.js';

export type SessionKind =
  | 'long'
  | 'threshold'
  | 'vo2'
  | 'easy'
  | 'treadmill'
  | 'spin'
  | 'rope'
  | 'strength'
  | 'race'
  | 'other';

export interface KindInfo {
  label: string;
  /** Counts towards running km. */
  run: boolean;
  /** Hard session: not the day before a race. */
  hard: boolean;
}

export const SESSION_KINDS: Record<SessionKind, KindInfo> = {
  long: { label: 'Langtur', run: true, hard: false },
  threshold: { label: 'Terskel', run: true, hard: true },
  vo2: { label: 'Fart / VO2max', run: true, hard: true },
  easy: { label: 'Rolig tur', run: true, hard: false },
  treadmill: { label: 'Mølle motbakke', run: true, hard: true },
  spin: { label: 'Spinning', run: false, hard: true },
  rope: { label: 'Hoppetau', run: false, hard: false },
  strength: { label: 'Styrke', run: false, hard: false },
  race: { label: 'Løp', run: true, hard: true },
  other: { label: 'Annet', run: false, hard: false },
};

export const isSessionKind = (k: unknown): k is SessionKind => typeof k === 'string' && k in SESSION_KINDS;

export interface PlannedSession {
  id: number;
  date: IsoDate;
  kind: SessionKind;
  title: string;
  km: number | null;
  details: string | null;
  done: boolean;
  source: 'manual' | 'template';
}

export type SessionDraft = Omit<PlannedSession, 'id' | 'done' | 'source'>;

export interface SessionPatch {
  date?: IsoDate;
  kind?: SessionKind;
  title?: string;
  km?: number | null;
  details?: string | null;
  done?: boolean;
}

/** Planned running km for a set of sessions. */
export const plannedRunKm = (sessions: Pick<PlannedSession, 'kind' | 'km'>[]) =>
  Math.round(sessions.reduce((sum, s) => sum + (SESSION_KINDS[s.kind].run && s.km ? s.km : 0), 0) * 10) / 10;
