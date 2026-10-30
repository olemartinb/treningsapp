// Session kinds: labels/flags from the server, icons for the UI.
import type { Component } from 'vue';
import { Activity, Bike, Dumbbell, Flag, Footprints, Gauge, Mountain, Repeat, Route, Zap } from 'lucide-vue-next';
import type { SessionKind } from './api';

export { SESSION_KINDS } from '../../server/src/plan/types';

export const KIND_ICON: Record<SessionKind, Component> = {
  long: Route,
  threshold: Gauge,
  vo2: Zap,
  easy: Footprints,
  treadmill: Mountain,
  spin: Bike,
  rope: Repeat,
  strength: Dumbbell,
  race: Flag,
  other: Activity,
};

/** Order of kinds in the picker. */
export const KIND_ORDER: SessionKind[] = ['easy', 'long', 'threshold', 'vo2', 'treadmill', 'spin', 'strength', 'rope', 'race', 'other'];
