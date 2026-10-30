// Worker bindings, vars and secrets (see wrangler.jsonc and .dev.vars.example).
export interface Env {
  DB: D1Database;
  CAL_KIDS_NAME: string;
  CAL_RACES_NAME: string;
  /** Cloudflare Access team domain, e.g. "myteam.cloudflareaccess.com". */
  ACCESS_TEAM_DOMAIN: string;
  /** Application Audience (AUD) tag of the Access application. */
  ACCESS_AUD: string;
  /** "true" only in .dev.vars for local development. */
  ALLOW_UNAUTHENTICATED?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  INTERVALS_API_KEY?: string;
  INTERVALS_ATHLETE_ID?: string;
}
