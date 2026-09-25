'use strict';

// PostgreSQL connection pool (node-postgres).
//
// Uses the SAME database as the existing implementation. Connection details
// come from the standard PG* environment variables (or DATABASE_URL):
//   PGHOST (default 127.0.0.1), PGPORT (default 5432),
//   PGDATABASE (default placement_tracker),
//   PGUSER (default postgres), PGPASSWORD (default postgres)
//
// Timestamps are stored as "timestamp without time zone" (plain calendar
// dates + UTC stamps, mirroring the reference implementation). The default
// pg parser would convert those columns to JS Dates in the server timezone,
// which can shift the calendar day. Parsing OID 1114 as a plain string keeps
// the stored value intact.

const { Pool, types } = require('pg');

// 1114 = timestamp without time zone -> keep as string, e.g. "2026-09-16 00:00:00"
types.setTypeParser(1114, (value) => value);

function buildConfig() {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL };
  }
  return {
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'placement_tracker',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres'
  };
}

const pool = new Pool(buildConfig());

module.exports = pool;
