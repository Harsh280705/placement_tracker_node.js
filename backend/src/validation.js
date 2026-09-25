'use strict';

// Backend validation rules. Mirrors the reference (.NET) implementation:
//
// Company:   required, 2-100 chars (whitespace-only is invalid)
// Role:      required, 2-100 chars (whitespace-only is invalid)
// Status:    required, one of Wishlist|Applied|Interview|Offer|Rejected
// AppliedOn: required unless Status is Wishlist
// JobUrl:    optional, must be a valid absolute http/https URL when supplied
// Notes:     optional, max 1000 chars
//
// Returns { errors, value } where `errors` uses the same shape as ASP.NET
// ValidationProblemDetails ({ Field: [messages] }, PascalCase keys) so the
// unchanged Vue frontend can display them, and `value` holds the normalized
// record (trimmed strings, null for empty optionals, YYYY-MM-DD appliedOn).

const ALLOWED_STATUSES = ['Wishlist', 'Applied', 'Interview', 'Offer', 'Rejected'];

function isMissing(value) {
  return value === undefined || value === null || (typeof value === 'string' && value.length === 0);
}

function normalizeOptional(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return value; // flagged invalid by the caller
  return value.trim() === '' ? null : value.trim();
}

// Accepts "YYYY-MM-DD" or an ISO datetime string; normalizes to "YYYY-MM-DD"
// so plain calendar dates are stored without timezone shifts.
// Returns { date } on success or { error } on failure.
function parseAppliedOn(value) {
  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return { error: 'Applied date is invalid.' };
  const [, y, m, d] = match;
  const check = new Date(`${y}-${m}-${d}T00:00:00Z`);
  if (
    Number.isNaN(check.getTime()) ||
    check.getUTCFullYear() !== Number(y) ||
    check.getUTCMonth() + 1 !== Number(m) ||
    check.getUTCDate() !== Number(d)
  ) {
    return { error: 'Applied date is invalid.' };
  }
  return { date: `${y}-${m}-${d}` };
}

function isValidJobUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function validateApplication(body) {
  const errors = {};

  const add = (field, message) => {
    if (!errors[field]) errors[field] = [];
    errors[field].push(message);
  };

  if (body === undefined || body === null || typeof body !== 'object' || Array.isArray(body)) {
    return {
      errors: { '': ['Invalid request body.'] },
      value: null
    };
  }

  const { company, role, status, appliedOn, jobUrl, notes } = body;

  // --- Company ---
  if (isMissing(company)) {
    add('Company', 'Company is required.');
  }
  if (typeof company !== 'string' || company.trim().length < 2 || company.trim().length > 100) {
    add('Company', 'Company must be 2-100 characters.');
  }

  // --- Role ---
  if (isMissing(role)) {
    add('Role', 'Role is required.');
  }
  if (typeof role !== 'string' || role.trim().length < 2 || role.trim().length > 100) {
    add('Role', 'Role must be 2-100 characters.');
  }

  // --- Status ---
  if (isMissing(status)) {
    add('Status', 'Status is required.');
  }
  if (!ALLOWED_STATUSES.includes(status)) {
    add('Status', 'Status must be one of: Wishlist, Applied, Interview, Offer, Rejected.');
  }

  // --- AppliedOn (required unless Wishlist) ---
  let normalizedAppliedOn = null;
  const appliedOnMissing = appliedOn === undefined || appliedOn === null || String(appliedOn).trim() === '';
  if (appliedOnMissing) {
    if (status !== 'Wishlist') {
      add('AppliedOn', 'Applied date is required unless status is Wishlist.');
    }
  } else {
    const parsed = parseAppliedOn(appliedOn);
    if (parsed.error) {
      add('AppliedOn', parsed.error);
    } else {
      normalizedAppliedOn = parsed.date;
    }
  }

  // --- JobUrl (optional) ---
  const normalizedJobUrl = normalizeOptional(jobUrl);
  if (normalizedJobUrl !== null) {
    if (typeof normalizedJobUrl !== 'string' || !isValidJobUrl(normalizedJobUrl)) {
      add('JobUrl', 'Please enter a valid URL (e.g. https://example.com/job).');
    }
  }

  // --- Notes (optional, max 1000) ---
  const normalizedNotes = normalizeOptional(notes);
  if (normalizedNotes !== null) {
    if (typeof normalizedNotes !== 'string') {
      add('Notes', 'Notes cannot be longer than 1000 characters.');
    } else if (normalizedNotes.length > 1000) {
      add('Notes', 'Notes cannot be longer than 1000 characters.');
    }
  }

  if (Object.keys(errors).length > 0) {
    return { errors, value: null };
  }

  return {
    errors: null,
    value: {
      company: company.trim(),
      role: role.trim(),
      status,
      appliedOn: normalizedAppliedOn,
      jobUrl: normalizedJobUrl,
      notes: normalizedNotes
    }
  };
}

module.exports = { validateApplication, ALLOWED_STATUSES };
