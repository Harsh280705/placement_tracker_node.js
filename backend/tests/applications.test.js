'use strict';

// API tests for GET/POST/PUT/DELETE /api/applications plus 404, validation
// and database-interaction checks. They run against the SAME PostgreSQL
// database but operate ONLY on nodejs_applications: every record created here
// uses a unique "NodeTest ..." company and is deleted afterwards, and the
// suite asserts the legacy "Applications" table is untouched.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const pool = require('../src/db/pool');
const { ensureSchema } = require('../src/db/schema');

const app = createApp();
const MARKER = `NodeTest ${Date.now()}`;

function payload(overrides = {}) {
  return {
    company: `${MARKER} Co`,
    role: 'Backend Intern',
    status: 'Applied',
    appliedOn: '2026-09-16',
    jobUrl: 'https://example.com/jobs/nodetest',
    notes: 'Created by the Node.js API test suite.',
    ...overrides
  };
}

async function applicationsCount() {
  const result = await pool.query('SELECT COUNT(*)::int AS count FROM "Applications"');
  return result.rows[0].count;
}

async function cleanup() {
  await pool.query('DELETE FROM nodejs_applications WHERE company LIKE $1', [`${MARKER}%`]);
}

let legacyCountBefore;

before(async () => {
  await ensureSchema();
  await cleanup();
  legacyCountBefore = await applicationsCount();
});

after(async () => {
  await cleanup();
  const legacyCountAfter = await applicationsCount();
  assert.equal(
    legacyCountAfter,
    legacyCountBefore,
    'legacy Applications table must remain untouched by the test suite'
  );
  await pool.end();
});

describe('GET /api/applications', () => {
  it('returns 200 with an array ordered by id descending', async () => {
    const first = await request(app).post('/api/applications').send(payload()).expect(201);
    const second = await request(app)
      .post('/api/applications')
      .send(payload({ company: `${MARKER} Co 2`, status: 'Interview', appliedOn: '2026-09-12' }))
      .expect(201);

    const res = await request(app).get('/api/applications').expect(200);
    assert.ok(Array.isArray(res.body));
    const ids = res.body.map((a) => a.id);
    const sorted = [...ids].sort((a, b) => b - a);
    assert.deepEqual(ids, sorted, 'applications must be ordered by id descending');
    assert.ok(ids.includes(first.body.id) && ids.includes(second.body.id));
  });

  it('returns an empty-shape record with the frontend contract fields', async () => {
    const created = await request(app).post('/api/applications').send(payload()).expect(201);
    for (const field of ['id', 'company', 'role', 'status', 'appliedOn', 'jobUrl', 'notes', 'createdAt']) {
      assert.ok(field in created.body, `response must include ${field}`);
    }
  });
});

describe('GET /api/applications/:id', () => {
  it('returns 200 with one record for an existing id', async () => {
    const created = await request(app).post('/api/applications').send(payload()).expect(201);
    const res = await request(app).get(`/api/applications/${created.body.id}`).expect(200);
    assert.equal(res.body.id, created.body.id);
    assert.equal(res.body.company, `${MARKER} Co`);
  });

  it('returns 404 with a message for a missing id', async () => {
    const res = await request(app).get('/api/applications/999999999').expect(404);
    assert.ok(res.body.message.includes('not found'));
  });

  it('returns 404 for malformed ids', async () => {
    for (const bad of ['abc', '1.5', '--1', '12abc']) {
      await request(app).get(`/api/applications/${bad}`).expect(404);
    }
  });
});

describe('POST /api/applications', () => {
  it('creates a record and returns 201 with the created record', async () => {
    const res = await request(app).post('/api/applications').send(payload()).expect(201);
    assert.equal(res.body.company, `${MARKER} Co`);
    assert.equal(res.body.status, 'Applied');
    assert.ok(res.body.appliedOn.startsWith('2026-09-16'));

    // persisted in nodejs_applications
    const fromDb = await pool.query('SELECT * FROM nodejs_applications WHERE id = $1', [res.body.id]);
    assert.equal(fromDb.rowCount, 1);
    assert.equal(fromDb.rows[0].company, `${MARKER} Co`);
  });

  it('allows Wishlist without appliedOn', async () => {
    await request(app)
      .post('/api/applications')
      .send(payload({ status: 'Wishlist', appliedOn: null }))
      .expect(201);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app).post('/api/applications').send({}).expect(400);
    assert.ok(res.body.errors.Company);
    assert.ok(res.body.errors.Role);
    assert.ok(res.body.errors.Status);
  });

  it('returns 400 for whitespace-only company', async () => {
    await request(app).post('/api/applications').send(payload({ company: '   ' })).expect(400);
  });

  it('returns 400 for an invalid status', async () => {
    await request(app).post('/api/applications').send(payload({ status: 'Hired' })).expect(400);
  });

  it('returns 400 when appliedOn is missing for a non-Wishlist status', async () => {
    await request(app)
      .post('/api/applications')
      .send(payload({ status: 'Offer', appliedOn: null }))
      .expect(400);
  });

  it('returns 400 for an invalid jobUrl', async () => {
    await request(app).post('/api/applications').send(payload({ jobUrl: 'not-a-url' })).expect(400);
  });

  it('returns 400 when notes exceed 1000 characters', async () => {
    await request(app)
      .post('/api/applications')
      .send(payload({ notes: 'n'.repeat(1001) }))
      .expect(400);
  });

  it('returns 400 for a malformed JSON body', async () => {
    await request(app)
      .post('/api/applications')
      .set('Content-Type', 'application/json')
      .send('{"company":')
      .expect(400);
  });
});

describe('PUT /api/applications/:id', () => {
  it('updates every field and returns 200', async () => {
    const created = await request(app).post('/api/applications').send(payload()).expect(201);
    const updated = payload({
      company: `${MARKER} Updated`,
      role: 'Offer Role',
      status: 'Offer',
      appliedOn: '2026-09-10',
      jobUrl: 'https://example.com/offer',
      notes: 'Updated notes'
    });
    const res = await request(app).put(`/api/applications/${created.body.id}`).send(updated).expect(200);
    assert.equal(res.body.company, `${MARKER} Updated`);
    assert.equal(res.body.role, 'Offer Role');
    assert.equal(res.body.status, 'Offer');
    assert.equal(res.body.jobUrl, 'https://example.com/offer');
    assert.equal(res.body.notes, 'Updated notes');

    const fromDb = await pool.query('SELECT * FROM nodejs_applications WHERE id = $1', [created.body.id]);
    assert.equal(fromDb.rows[0].company, `${MARKER} Updated`);
  });

  it('returns 404 for a missing id', async () => {
    await request(app).put('/api/applications/999999999').send(payload()).expect(404);
  });

  it('returns 404 for a malformed id', async () => {
    await request(app).put('/api/applications/abc').send(payload()).expect(404);
  });

  it('returns 400 for invalid data', async () => {
    const created = await request(app).post('/api/applications').send(payload()).expect(201);
    await request(app)
      .put(`/api/applications/${created.body.id}`)
      .send(payload({ status: 'Hired' }))
      .expect(400);
  });
});

describe('DELETE /api/applications/:id', () => {
  it('deletes an existing record and returns 204', async () => {
    const created = await request(app).post('/api/applications').send(payload()).expect(201);
    await request(app).delete(`/api/applications/${created.body.id}`).expect(204);
    await request(app).get(`/api/applications/${created.body.id}`).expect(404);

    const fromDb = await pool.query('SELECT * FROM nodejs_applications WHERE id = $1', [created.body.id]);
    assert.equal(fromDb.rowCount, 0);
  });

  it('returns 404 for a missing id', async () => {
    await request(app).delete('/api/applications/999999999').expect(404);
  });

  it('returns 404 for a malformed id', async () => {
    await request(app).delete('/api/applications/abc').expect(404);
  });
});

describe('database interaction', () => {
  it('writes only to nodejs_applications, never to Applications', async () => {
    const before = await applicationsCount();
    const created = await request(app).post('/api/applications').send(payload()).expect(201);
    await request(app).put(`/api/applications/${created.body.id}`).send(payload()).expect(200);
    await request(app).delete(`/api/applications/${created.body.id}`).expect(204);
    const after = await applicationsCount();
    assert.equal(after, before);
  });
});
