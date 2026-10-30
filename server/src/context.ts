// Hono context shared by the app and its route modules.
import type { Context } from 'hono';
import type { Env } from './env.js';
import type { GoogleCalendar } from './calendar/google.js';
import type { CalendarService } from './calendar/service.js';

export type AppEnv = { Bindings: Env; Variables: { google: GoogleCalendar; calendar: CalendarService } };
export type AppContext = Context<AppEnv>;
