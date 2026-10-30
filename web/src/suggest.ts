// Today's session hint from the training rules in CLAUDE.md (until the Plan view exists).
import type { DailyLog, DayInfo } from './api';

export interface Suggestion {
  title: string;
  detail: string;
}

export function suggestSession(day: DayInfo | null, log: DailyLog): Suggestion {
  if (log.kneeOk === false) {
    return { title: 'Alternativ trening', detail: 'Spinning 45–60 min eller gange på mølle. Ingen løping med vondt kne.' };
  }
  if (day?.type === 'barneuke') {
    if (day.kidsHomeAllDay) {
      return { title: 'Kveldsøkt etter 20:00', detail: 'Barna er hjemme hele dagen. Mølle 10×2 min motbakke eller spinning 4×8 min terskel.' };
    }
    return { title: 'Morgentur før barna våkner', detail: '30–45 min rolig i Z2 (6–9 km). Alternativt mølle eller spinning etter 20:00.' };
  }
  if (day?.type === 'eneuke') {
    return { title: 'Eneuke – kvalitet', detail: 'Langtur 20–22 km, terskel 10–12 km @ 3:45–3:50, fart 10–12×400 m og 2 rolige turer.' };
  }
  return { title: 'Rolig tur', detail: 'Ingen uketype fra kalenderen ennå.' };
}
