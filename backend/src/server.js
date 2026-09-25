'use strict';

// Entry point: ensures the nodejs_applications table exists, then serves the
// API internally on 127.0.0.1:3000 (NGINX :8080 is the public entry point).

const { createApp } = require('./app');
const pool = require('./db/pool');
const { ensureSchema } = require('./db/schema');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';

async function main() {
  await ensureSchema();
  const app = createApp();
  app.listen(PORT, HOST, () => {
    // eslint-disable-next-line no-console
    console.log(`Placement Tracker API listening on http://${HOST}:${PORT}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start API:', err.message);
  pool.end().finally(() => process.exit(1));
});
