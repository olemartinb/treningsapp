import { buildApp } from './app.js';
import { config } from './config.js';
import { openDb } from './db.js';

const db = openDb(config.dbPath);
const app = await buildApp({ db, logger: true });

const shutdown = async () => {
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: config.port, host: config.host });
