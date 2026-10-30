// Fills a handover-to-handover period with sessions from the week-type templates in CLAUDE.md.
//
// - Templates describe a 7-day period starting on the handover day (usually Friday).
// - Shorter periods keep the highest-priority sessions; longer ones add easy runs.
// - Volume discipline: planned run km is kept within the period's (scaled) target.
// - Never overwrites a date that already has sessions, never plans in the past,
//   puts races on race day and keeps the day before a race easy.
import { addDays, dateRange, type IsoDate } from '../dates.js';
import type { KidPeriod } from '../calendar/kidWeeks.js';
import type { Race } from '../calendar/service.js';
import { periodTarget } from '../training/targets.js';
import { SESSION_KINDS, type SessionDraft, type SessionKind } from './types.js';

interface Slot {
  kind: SessionKind;
  km: number | null;
  title: string;
  details: string;
  /** Preferred day index in a 7-day period (0 = handover day). */
  day: number;
}

const STRENGTH = 'Knebøy, bulgarske utfall, RDL, tunge tåhev. Eksentrisk ettbeins knebøy på skråbrett 3×10–12.';
const MIN_EASY_KM = 5;
/** The only kinds allowed the day before a race (no long run, no hard session, no heavy legs). */
const PRE_RACE_KINDS: SessionKind[] = ['easy', 'rope', 'other'];
const MAX_EASY_KM = 10;

/** In priority order. */
const ENEUKE: Slot[] = [
  { kind: 'long', km: 21, day: 1, title: 'Langtur 21 km', details: '14–15 km rolig Z2, siste 6–8 km progressivt ned mot 3:47–3:52/km.' },
  { kind: 'threshold', km: 12, day: 4, title: 'Terskel 3×4 km', details: '3×4 km @ 3:45–3:50/km med 2 min jogg. Alternativ: 4×3 km.' },
  { kind: 'vo2', km: 9, day: 6, title: 'Fart 10×400 m', details: '10–12×400 m @ 3:25–3:30/km, eller motbakkeintervaller.' },
  { kind: 'easy', km: 10, day: 3, title: '', details: 'Rolig i Z1/Z2.' },
  { kind: 'easy', km: 8, day: 0, title: '', details: 'Rolig i Z1/Z2.' },
  { kind: 'strength', km: null, day: 2, title: 'Styrke + skråbrett', details: STRENGTH },
];

const BARNEUKE: Slot[] = [
  { kind: 'easy', km: 8, day: 0, title: '', details: '30–45 min i Z2 før barna våkner.' },
  {
    kind: 'treadmill',
    km: 6,
    day: 3,
    title: 'Mølle 10×2 min motbakke',
    details: 'Etter 20:00. 10×2 min på 15–18 % stigning (Z4/5), 1 min flatt mellom. 45 min totalt.',
  },
  { kind: 'easy', km: 7, day: 2, title: '', details: '30–45 min i Z2 før barna våkner.' },
  { kind: 'spin', km: null, day: 4, title: 'Spinning 4×8 min', details: 'Etter 20:00. 4×8 min eller 5×6 min på terskel, kadens ≥ 90. 45–60 min.' },
  { kind: 'easy', km: 7, day: 5, title: '', details: '30–45 min i Z2 før barna våkner.' },
  { kind: 'strength', km: null, day: 1, title: 'Styrke + hoppetau', details: `${STRENGTH} Hoppetau 10–15 min (1000–1500 hopp).` },
];

const easyTitle = (type: KidPeriod['type'], km: number) => `${type === 'barneuke' ? 'Morgentur' : 'Rolig'} ${km} km`;
const runKm = (slots: Slot[]) => slots.reduce((sum, s) => sum + (SESSION_KINDS[s.kind].run && s.km ? s.km : 0), 0);

export interface TemplateInput {
  period: Pick<KidPeriod, 'type' | 'start' | 'end' | 'days'>;
  races: Race[];
  /** Dates in the period that already have sessions (left untouched). */
  takenDates: IsoDate[];
  /** Run km already planned or run in the period, counted against the target. */
  usedKm: number;
  today: IsoDate;
}

export function templateForPeriod({ period, races, takenDates, usedKm, today }: TemplateInput): SessionDraft[] {
  const n = period.days;
  const dates = dateRange(period.start, addDays(period.end, -1));
  const target = periodTarget(period);
  const raceDates = new Set(races.map((r) => r.date));
  const taken = new Set(takenDates);
  const isFree = (i: number) => dates[i]! >= today && !taken.has(dates[i]!) && !raceDates.has(dates[i]!);
  const freeCount = dates.filter((_, i) => isFree(i)).length;

  const drafts: SessionDraft[] = [];
  for (const r of races) {
    if (r.date >= today && r.date >= period.start && r.date < period.end && !taken.has(r.date)) {
      drafts.push({ date: r.date, kind: 'race', title: r.title, km: null, details: null });
    }
  }

  // Pick by priority: scale the count to the period length and the free days left.
  const base = period.type === 'eneuke' ? ENEUKE : BARNEUKE;
  const count = Math.min(freeCount, n >= 7 ? base.length : Math.max(1, Math.round((base.length * n) / 7)));
  const slots = base.slice(0, count).map((s) => ({ ...s }));

  // Trim to the target max: shorten easy runs first, then drop the lowest-priority run.
  const budget = target.max - usedKm;
  while (runKm(slots) > budget) {
    const easy = [...slots].reverse().find((s) => s.kind === 'easy' && (s.km ?? 0) > MIN_EASY_KM + 1);
    if (easy) easy.km = Math.max(MIN_EASY_KM + 1, Math.floor(easy.km! - (runKm(slots) - budget)));
    else {
      const last = slots.map((s) => SESSION_KINDS[s.kind].run).lastIndexOf(true);
      if (last < 0) break;
      slots.splice(last, 1);
    }
  }
  // Top up with easy runs towards the target min while free days remain.
  let extraDay = 7;
  while (target.min - usedKm - runKm(slots) > 0 && slots.length < freeCount) {
    const km = Math.min(MAX_EASY_KM, Math.floor(budget - runKm(slots)));
    if (km < MIN_EASY_KM) break;
    slots.push({ ...base.find((s) => s.kind === 'easy')!, km, day: extraDay++ });
  }

  // Place each slot on its preferred day (scaled to the period length), else the nearest allowed day.
  const used = new Set<number>();
  const hardDays = new Set<number>();
  const allowed = (i: number, slot: Slot, strict: boolean) => {
    if (i < 0 || i >= n || used.has(i) || !isFree(i)) return false;
    if (raceDates.has(addDays(dates[i]!, 1)) && !PRE_RACE_KINDS.includes(slot.kind)) return false;
    if (!SESSION_KINDS[slot.kind].hard) return true;
    return !strict || (!hardDays.has(i - 1) && !hardDays.has(i + 1));
  };
  // Extra easy runs (day >= 7) are spread evenly over the period.
  const extras = slots.filter((s) => s.day >= 7).length;
  const scaledDay = (slot: Slot) =>
    slot.day >= 7 ? Math.round(((slot.day - 6) * (n - 1)) / (extras + 1)) : Math.round((slot.day * (n - 1)) / 6);
  for (const slot of slots) {
    const preferred = scaledDay(slot);
    const order = [preferred];
    for (let d = 1; d < n; d++) order.push(preferred + d, preferred - d);
    const pick = order.find((i) => allowed(i, slot, true)) ?? order.find((i) => allowed(i, slot, false));
    if (pick === undefined) continue;
    used.add(pick);
    if (SESSION_KINDS[slot.kind].hard) hardDays.add(pick);
    drafts.push({
      date: dates[pick]!,
      kind: slot.kind,
      title: slot.kind === 'easy' ? easyTitle(period.type, slot.km!) : slot.title,
      km: slot.km,
      details: slot.details,
    });
  }

  return drafts.sort((a, b) => a.date.localeCompare(b.date));
}
