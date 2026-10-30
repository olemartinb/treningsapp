// Small request helpers shared by the route modules.
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { diffDays, isIsoDate, type IsoDate } from './dates.js';

const MAX_RANGE_DAYS = 400;

export const bad = (message: string) => new HTTPException(400, { message });

export function range(c: Context): { from: IsoDate; to: IsoDate } {
  const from = c.req.query('from') ?? '';
  const to = c.req.query('to') ?? '';
  if (!isIsoDate(from) || !isIsoDate(to) || to < from || diffDays(from, to) > MAX_RANGE_DAYS) throw bad('Invalid date range');
  return { from, to };
}

export function dateQuery(c: Context, name: string, fallback: IsoDate): IsoDate {
  const value = c.req.query(name);
  if (value === undefined) return fallback;
  if (!isIsoDate(value)) throw bad(`Invalid ${name}`);
  return value;
}
