// Environment config. Secrets live only here on the server.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const env = (key: string, fallback = '') => process.env[key]?.trim() || fallback;

const port = Number(env('PORT', '8787'));

export const config = {
  port,
  host: env('HOST', '0.0.0.0'),
  publicUrl: env('PUBLIC_URL', `http://localhost:${port}`).replace(/\/$/, ''),
  dbPath: path.resolve(root, env('DB_PATH', './data/treningsapp.sqlite')),
  webDist: path.resolve(root, 'web/dist'),
  google: {
    clientId: env('GOOGLE_CLIENT_ID'),
    clientSecret: env('GOOGLE_CLIENT_SECRET'),
    kidsCalendar: env('CAL_KIDS_NAME', 'Samvær'),
    racesCalendar: env('CAL_RACES_NAME', 'Løp / trening'),
  },
  intervals: {
    apiKey: env('INTERVALS_API_KEY'),
    athleteId: env('INTERVALS_ATHLETE_ID'),
  },
};
