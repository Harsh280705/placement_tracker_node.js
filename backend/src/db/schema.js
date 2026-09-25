'use strict';

// Ensures the Node.js implementation's own table exists. Idempotent and
// never touches the original "Applications" table.
//
// nodejs_applications mirrors the reference schema with snake_case columns:
//   id, company, role, status, applied_on, job_url, notes, created_at

const pool = require('./pool');

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS nodejs_applications (
  id SERIAL PRIMARY KEY,
  company VARCHAR(100) NOT NULL,
  role VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL
    CHECK (status IN ('Wishlist', 'Applied', 'Interview', 'Offer', 'Rejected')),
  applied_on TIMESTAMP WITHOUT TIME ZONE NULL,
  job_url TEXT NULL,
  notes VARCHAR(1000) NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);`;

async function ensureSchema(client) {
  const runner = client || pool;
  await runner.query(CREATE_TABLE_SQL);
}

module.exports = { ensureSchema, CREATE_TABLE_SQL };
