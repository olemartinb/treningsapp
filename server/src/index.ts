// Worker entry. Static assets (web/dist) are served by Cloudflare; only /api/* reaches fetch.
import { createApp } from './app.js';
import type { Env } from './env.js';
import { nightlySync } from './intervals/sync.js';

const app = createApp();

export default {
  fetch: app.fetch,
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(nightlySync(env));
  },
} satisfies ExportedHandler<Env>;
