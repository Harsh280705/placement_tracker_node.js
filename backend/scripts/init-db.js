'use strict';

// One-time (idempotent) database setup for the Node.js implementation:
//
// 1. CREATE TABLE IF NOT EXISTS nodejs_applications (never touches "Applications").
// 2. If nodejs_applications is EMPTY and the legacy "Applications" table has
//    rows, copy those rows (preserving ids + all values) so the Node.js API
//    starts from the same data as the existing implementation.
// 3. Reset the nodejs_applications id sequence to MAX(id) so new inserts do
//    not collide with copied ids.
//
// Safe to run on every container start: the copy only happens when the new
// table is empty, so existing nodejs_applications data is never overwritten
// and records are never duplicated.

const pool = require('../src/db/pool');
const { ensureSchema } = require('../src/db/schema');

async function tableExists(client, name) {
  const result = await client.query('SELECT to_regclass($1) AS oid', [name]);
  return result.rows[0].oid !== null;
}

async function initDb() {
  const client = await pool.connect();
  try {
    await ensureSchema(client);

    const { rows: countRows } = await client.query('SELECT COUNT(*)::int AS count FROM nodejs_applications');
    const targetCount = countRows[0].count;
    if (targetCount > 0) {
      console.log(`nodejs_applications already has ${targetCount} row(s); nothing to copy.`);
      return { copied: 0 };
    }

    if (!(await tableExists(client, 'public."Applications"')) && !(await tableExists(client, 'public.Applications'))) {
      console.log('Legacy Applications table not found; seeding nodejs_applications with sample records.');
      await seedSamples(client);
      return { copied: 3, seeded: true };
    }

    const legacy = await client.query(
      'SELECT "Id", "Company", "Role", "Status", "AppliedOn", "JobUrl", "Notes", "CreatedAt" FROM "Applications" ORDER BY "Id"'
    );
    if (legacy.rowCount === 0) {
      console.log('Legacy Applications table is empty; seeding nodejs_applications with sample records.');
      await seedSamples(client);
      return { copied: 3, seeded: true };
    }

    await client.query('BEGIN');
    try {
      for (const row of legacy.rows) {
        await client.query(
          `INSERT INTO nodejs_applications (id, company, role, status, applied_on, job_url, notes, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO NOTHING`,
          [row.Id, row.Company, row.Role, row.Status, row.AppliedOn, row.JobUrl, row.Notes, row.CreatedAt]
        );
      }
      await client.query(
        "SELECT setval(pg_get_serial_sequence('nodejs_applications', 'id'), COALESCE((SELECT MAX(id) FROM nodejs_applications), 1))"
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }

    const { rows: after } = await client.query('SELECT COUNT(*)::int AS count FROM nodejs_applications');
    console.log(`Copied ${after[0].count} record(s) from Applications into nodejs_applications.`);
    return { copied: after[0].count };
  } finally {
    client.release();
    await pool.end();
  }
}

// Same 3 sample records the reference implementation seeds in Development,
// used only when there is no legacy Applications data to copy from.
async function seedSamples(client) {
  await client.query(
    `INSERT INTO nodejs_applications (company, role, status, applied_on, job_url, notes)
     VALUES
       ('Acme Labs', 'Python Intern', 'Applied', '2026-09-16', 'https://example.com/jobs/acme-python-intern', 'Sample record.'),
       ('Northstar', 'Graduate Engineer', 'Interview', '2026-09-12', NULL, 'Sample record.'),
       ('Contoso', 'Backend Intern', 'Rejected', '2026-09-05', NULL, 'Sample record.')`
  );
}

if (require.main === module) {
  initDb().catch((err) => {
    console.error('Database initialization failed:', err.message);
    process.exit(1);
  });
}

module.exports = { initDb };
