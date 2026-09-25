'use strict';

// CRUD handlers operating ONLY on the nodejs_applications table.
// The original "Applications" table is never referenced here.

const pool = require('../db/pool');
const { validateApplication } = require('../validation');
const { mapRow } = require('../mappers');

function validationProblem(res, errors) {
  return res.status(400).json({
    type: 'https://tools.ietf.org/html/rfc9110#section-15.5.1',
    title: 'One or more validation errors occurred.',
    status: 400,
    errors
  });
}

function notFound(res, id) {
  return res.status(404).json({ message: `Application ${id} not found.` });
}

// Route ids must be integers (mirrors the {id:int} route constraint of the
// reference API); anything else is treated as "not found".
function parseId(raw) {
  if (!/^-?\d+$/.test(String(raw))) return null;
  return Number.parseInt(String(raw), 10);
}

// GET /api/applications -> 200 (id DESC, like the reference API)
async function getAll(req, res, next) {
  try {
    const result = await pool.query('SELECT * FROM nodejs_applications ORDER BY id DESC');
    res.json(result.rows.map(mapRow));
  } catch (err) {
    next(err);
  }
}

// GET /api/applications/:id -> 200 | 404
async function getOne(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res, req.params.id);
    const result = await pool.query('SELECT * FROM nodejs_applications WHERE id = $1', [id]);
    if (result.rowCount === 0) return notFound(res, id);
    res.json(mapRow(result.rows[0]));
  } catch (err) {
    next(err);
  }
}

// POST /api/applications -> 201 | 400
async function create(req, res, next) {
  try {
    const { errors, value } = validateApplication(req.body);
    if (errors) return validationProblem(res, errors);
    const result = await pool.query(
      `INSERT INTO nodejs_applications (company, role, status, applied_on, job_url, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [value.company, value.role, value.status, value.appliedOn, value.jobUrl, value.notes]
    );
    const created = mapRow(result.rows[0]);
    res.status(201).location(`/api/applications/${created.id}`).json(created);
  } catch (err) {
    next(err);
  }
}

// PUT /api/applications/:id -> 200 | 400 | 404
async function update(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res, req.params.id);
    const { errors, value } = validateApplication(req.body);
    if (errors) return validationProblem(res, errors);
    const existing = await pool.query('SELECT * FROM nodejs_applications WHERE id = $1', [id]);
    if (existing.rowCount === 0) return notFound(res, id);
    const result = await pool.query(
      `UPDATE nodejs_applications
       SET company = $1, role = $2, status = $3, applied_on = $4, job_url = $5, notes = $6
       WHERE id = $7
       RETURNING *`,
      [value.company, value.role, value.status, value.appliedOn, value.jobUrl, value.notes, id]
    );
    res.json(mapRow(result.rows[0]));
  } catch (err) {
    next(err);
  }
}

// DELETE /api/applications/:id -> 204 | 404
async function remove(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res, req.params.id);
    const result = await pool.query('DELETE FROM nodejs_applications WHERE id = $1', [id]);
    if (result.rowCount === 0) return notFound(res, id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

module.exports = { getAll, getOne, create, update, remove };
