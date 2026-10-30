// Worker entry. Static assets (web/dist) are served by Cloudflare; only /api/* reaches this code.
import { createApp } from './app.js';

export default createApp();
