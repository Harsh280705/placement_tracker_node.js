'use strict';

// Maps snake_case PostgreSQL rows (nodejs_applications) to the camelCase JSON
// contract the existing Vue frontend expects:
//   { id, company, role, status, appliedOn, jobUrl, notes, createdAt }

function toIsoDateTime(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value);
  // pg returns "timestamp without time zone" as "YYYY-MM-DD HH:mm:ss[.ffffff]"
  // (see db/pool.js type parser); present it ISO-style like the reference API.
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(text)) {
    return text.replace(' ', 'T');
  }
  return text;
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    company: row.company,
    role: row.role,
    status: row.status,
    appliedOn: row.applied_on ? toIsoDateTime(row.applied_on) : null,
    jobUrl: row.job_url,
    notes: row.notes,
    createdAt: toIsoDateTime(row.created_at)
  };
}

module.exports = { mapRow };
