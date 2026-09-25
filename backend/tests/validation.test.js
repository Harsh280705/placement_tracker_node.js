'use strict';

// Unit tests for backend validation rules (no database required).
// Mirrors the reference validation suite: required fields, lengths,
// allowed statuses, AppliedOn/Wishlist rule, URL and notes rules.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateApplication, ALLOWED_STATUSES } = require('../src/validation');

function validInput(overrides = {}) {
  return {
    company: 'Acme Labs',
    role: 'Backend Intern',
    status: 'Applied',
    appliedOn: '2026-09-16',
    jobUrl: 'https://example.com/jobs/acme',
    notes: 'Sample record.',
    ...overrides
  };
}

describe('validation: allowed statuses', () => {
  it('exposes exactly the five supported statuses', () => {
    assert.deepEqual(ALLOWED_STATUSES, ['Wishlist', 'Applied', 'Interview', 'Offer', 'Rejected']);
  });

  it('accepts each allowed status', () => {
    for (const status of ALLOWED_STATUSES) {
      const appliedOn = status === 'Wishlist' ? null : '2026-09-16';
      const { errors } = validateApplication(validInput({ status, appliedOn }));
      assert.equal(errors, null, `status ${status} should be valid`);
    }
  });

  it('rejects an unknown status', () => {
    const { errors, value } = validateApplication(validInput({ status: 'Hired' }));
    assert.equal(value, null);
    assert.ok(errors.Status.join(' ').includes('Wishlist, Applied, Interview, Offer, Rejected'));
  });

  it('rejects a missing status', () => {
    const { errors } = validateApplication(validInput({ status: undefined }));
    assert.ok(errors.Status.includes('Status is required.'));
  });
});

describe('validation: company and role', () => {
  it('accepts a valid payload', () => {
    const { errors, value } = validateApplication(validInput());
    assert.equal(errors, null);
    assert.equal(value.company, 'Acme Labs');
    assert.equal(value.role, 'Backend Intern');
  });

  it('rejects missing company and role', () => {
    const { errors } = validateApplication(validInput({ company: '', role: '' }));
    assert.ok(errors.Company);
    assert.ok(errors.Role);
  });

  it('rejects whitespace-only company and role', () => {
    const { errors } = validateApplication(validInput({ company: '   ', role: '\t ' }));
    assert.ok(errors.Company.join(' ').includes('2-100'));
    assert.ok(errors.Role.join(' ').includes('2-100'));
  });

  it('rejects single-character company and role', () => {
    const { errors } = validateApplication(validInput({ company: 'A', role: 'B' }));
    assert.ok(errors.Company);
    assert.ok(errors.Role);
  });

  it('rejects company and role longer than 100 chars', () => {
    const long = 'x'.repeat(101);
    const { errors } = validateApplication(validInput({ company: long, role: long }));
    assert.ok(errors.Company);
    assert.ok(errors.Role);
  });

  it('trims company and role in the normalized value', () => {
    const { value } = validateApplication(validInput({ company: '  Acme  ', role: ' Dev ' }));
    assert.equal(value.company, 'Acme');
    assert.equal(value.role, 'Dev');
  });
});

describe('validation: AppliedOn / Wishlist rule', () => {
  it('requires appliedOn when status is not Wishlist', () => {
    for (const status of ['Applied', 'Interview', 'Offer', 'Rejected']) {
      const { errors } = validateApplication(validInput({ status, appliedOn: null }));
      assert.ok(errors.AppliedOn, `status ${status} without appliedOn should fail`);
    }
  });

  it('allows missing appliedOn when status is Wishlist', () => {
    const { errors, value } = validateApplication(validInput({ status: 'Wishlist', appliedOn: null }));
    assert.equal(errors, null);
    assert.equal(value.appliedOn, null);
  });

  it('rejects an invalid appliedOn date', () => {
    const { errors } = validateApplication(validInput({ appliedOn: 'not-a-date' }));
    assert.ok(errors.AppliedOn);
  });

  it('rejects impossible calendar dates', () => {
    const { errors } = validateApplication(validInput({ appliedOn: '2026-02-30' }));
    assert.ok(errors.AppliedOn);
  });
});

describe('validation: jobUrl and notes', () => {
  it('allows missing jobUrl and notes', () => {
    const { errors, value } = validateApplication(validInput({ jobUrl: null, notes: null }));
    assert.equal(errors, null);
    assert.equal(value.jobUrl, null);
    assert.equal(value.notes, null);
  });

  it('treats empty/whitespace jobUrl and notes as null', () => {
    const { errors, value } = validateApplication(validInput({ jobUrl: '  ', notes: '' }));
    assert.equal(errors, null);
    assert.equal(value.jobUrl, null);
    assert.equal(value.notes, null);
  });

  it('rejects an invalid URL', () => {
    const { errors } = validateApplication(validInput({ jobUrl: 'not-a-url' }));
    assert.ok(errors.JobUrl);
  });

  it('rejects non-http(s) URLs', () => {
    const { errors } = validateApplication(validInput({ jobUrl: 'ftp://example.com/job' }));
    assert.ok(errors.JobUrl);
  });

  it('rejects notes longer than 1000 characters', () => {
    const { errors } = validateApplication(validInput({ notes: 'n'.repeat(1001) }));
    assert.ok(errors.Notes);
  });

  it('accepts notes of exactly 1000 characters', () => {
    const { errors } = validateApplication(validInput({ notes: 'n'.repeat(1000) }));
    assert.equal(errors, null);
  });
});

describe('validation: invalid request bodies', () => {
  it('rejects a non-object body', () => {
    for (const body of [null, undefined, 'text', 42, []]) {
      const { errors, value } = validateApplication(body);
      assert.ok(errors, `body ${JSON.stringify(body)} should fail`);
      assert.equal(value, null);
    }
  });
});
