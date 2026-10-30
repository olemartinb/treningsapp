import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from './fixtures/intervals-activities.json' with { type: 'json' };
import { IntervalsClient, IntervalsError, toActivity, toWellness, type IcuActivity, type IntervalsSource } from '../src/intervals/client.js';
import { listActivities, latestWellness } from '../src/intervals/repo.js';
import { BACKFILL_DAYS, RECENT_DAYS, nightlySync, syncRange, syncRecent } from '../src/intervals/sync.js';
import { paceSecPerKm, type Activity, type Wellness } from '../src/intervals/types.js';
import { kneeFlag } from '../src/training/knee.js';
import { periodVolume } from '../src/training/volume.js';
import type { Env } from '../src/env.js';
import { testD1 } from './d1.js';

const raw = fixture.items as IcuActivity[];
const activities = raw.map(toActivity).filter((a): a is Activity => a !== null);
const NOW = new Date('2026-10-30T21:00:00Z');

function fakeSource(acts: Activity[], wellness: Wellness[] = []) {
  const calls: [string, string][] = [];
  const source: IntervalsSource = {
    activities: async (from, to) => {
      calls.push([from, to]);
      return acts.filter((a) => a.date >= from && a.date <= to);
    },
    wellness: async () => wellness,
  };
  return { source, calls };
}

afterEach(() => vi.unstubAllGlobals());

describe('mapping', () => {
  it('maps activities and skips ones the API does not share', () => {
    expect(activities).toHaveLength(5);
    expect(activities[0]).toEqual({
      id: 'i90000001',
      date: '2026-10-26',
      startLocal: '2026-10-26T06:02:11',
      type: 'Run',
      name: 'Morgentur',
      distanceM: 7412.3,
      movingS: 2350,
      avgHr: 141,
      maxHr: 156,
      load: 38,
    });
    expect(activities.find((a) => a.type === 'WeightTraining')).toMatchObject({ distanceM: null, avgHr: null });
  });

  it('computes pace in seconds per km', () => {
    expect(paceSecPerKm({ distanceM: 10_000, movingS: 2270 })).toBe(227); // 3:47/km
    expect(paceSecPerKm({ distanceM: null, movingS: 2400 })).toBeNull();
  });

  it('maps wellness and rejects odd ids', () => {
    expect(toWellness({ id: '2026-10-30', ctl: 52.3, atl: 61.1, weight: 71.8, restingHR: 44 })).toEqual({
      date: '2026-10-30',
      ctl: 52.3,
      atl: 61.1,
      weightKg: 71.8,
      restingHr: 44,
    });
    expect(toWellness({ id: 'nope' })).toBeNull();
  });
});

describe('IntervalsClient', () => {
  it('calls the API with Basic auth and maps the response', async () => {
    const fetchMock = vi.fn(async () => Response.json(raw));
    vi.stubGlobal('fetch', fetchMock);
    const result = await new IntervalsClient('secret-key', 'i123456').activities('2026-10-01', '2026-10-30');
    expect(result).toHaveLength(5);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://intervals.icu/api/v1/athlete/i123456/activities?oldest=2026-10-01&newest=2026-10-30');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${btoa('API_KEY:secret-key')}`);
  });

  it('throws IntervalsError on a failed request', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Unauthorized', { status: 401 })));
    await expect(new IntervalsClient('bad', 'i1').wellness('2026-10-01', '2026-10-30')).rejects.toBeInstanceOf(IntervalsError);
  });
});

describe('sync', () => {
  it('stores activities and wellness, and updates on re-sync', async () => {
    const db = testD1();
    const { source } = fakeSource(activities, [{ date: '2026-10-30', ctl: 50, atl: 60, weightKg: null, restingHr: null }]);
    const result = await syncRange(db, source, '2026-10-01', '2026-10-30', NOW);
    expect(result).toMatchObject({ activities: 5, wellness: 1, lastSyncAt: NOW.toISOString() });
    expect(await listActivities(db, '2026-10-30', '2026-10-30')).toHaveLength(2);
    expect(await latestWellness(db, '2026-10-30')).toMatchObject({ ctl: 50, atl: 60 });

    const renamed = activities.map((a) => (a.id === 'i90000004' ? { ...a, name: 'Rolig + strides' } : a));
    await syncRange(db, fakeSource(renamed).source, '2026-10-01', '2026-10-30', NOW);
    expect((await listActivities(db, '2026-10-30', '2026-10-30'))[0]?.name).toBe('Rolig + strides');
  });

  it('removes activities deleted in intervals.icu, but only inside the synced window', async () => {
    const db = testD1();
    await syncRange(db, fakeSource(activities).source, '2026-10-01', '2026-10-30', NOW);
    const without = activities.filter((a) => a.id !== 'i90000002');
    await syncRange(db, fakeSource(without).source, '2026-10-28', '2026-10-30', NOW);
    const ids = (await listActivities(db, '2026-10-01', '2026-10-30')).map((a) => a.id);
    expect(ids).not.toContain('i90000002');
    expect(ids).toContain('i90000001'); // outside the window, untouched
  });

  it('backfills on the first sync and re-reads a recent window afterwards', async () => {
    const db = testD1();
    const { source, calls } = fakeSource(activities);
    await syncRecent(db, source, NOW);
    await syncRecent(db, source, NOW);
    expect(calls).toEqual([
      [new Date(Date.parse('2026-10-30') - BACKFILL_DAYS * 864e5).toISOString().slice(0, 10), '2026-10-30'],
      [new Date(Date.parse('2026-10-30') - RECENT_DAYS * 864e5).toISOString().slice(0, 10), '2026-10-30'],
    ]);
  });

  it('nightly sync does nothing without intervals secrets', async () => {
    const env = { DB: testD1() } as Env;
    expect(await nightlySync(env, NOW)).toBeNull();
  });
});

describe('training rules', () => {
  it('flags runs without a passed knee test', () => {
    const run = { type: 'Run' };
    expect(kneeFlag(run, { kneeOk: true })).toBeNull();
    expect(kneeFlag(run, { kneeOk: false })).toBe('failed');
    expect(kneeFlag(run, { kneeOk: null })).toBe('missing');
    expect(kneeFlag(run, undefined)).toBe('missing');
    expect(kneeFlag({ type: 'VirtualRun' }, undefined)).toBe('missing');
    expect(kneeFlag({ type: 'VirtualRide' }, undefined)).toBeNull();
  });

  it('sums run km inside the period only', () => {
    const v = periodVolume(activities, { start: '2026-10-26', end: '2026-11-02' }, { min: 25, max: 35 });
    expect(v).toEqual({
      km: 21.5,
      status: 'under',
      kmByDate: { '2026-10-26': 7.4, '2026-10-28': 6.1, '2026-10-30': 8 },
    });
    expect(periodVolume(activities, { start: '2026-10-27', end: '2026-10-31' }, { min: 5, max: 10 }).status).toBe('over');
  });
});
