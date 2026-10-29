import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractReport, grade, scoreReport, validateReport } from './score-audit.mjs';

const load = () => JSON.parse(readFileSync(new URL('./fixtures/sample-report.json', import.meta.url), 'utf8'));

test('sample report validates', () => {
  const { errors } = validateReport(load());
  assert.deepEqual(errors, []);
});

test('scores categories from deductions and rescales for unverified ones', () => {
  const r = scoreReport(load());
  assert.equal(r.categories.input_schema.score, 80);
  assert.equal(r.categories.triggers_pagination.score, 90);
  assert.equal(r.categories.testing.score, 75);
  assert.equal(r.categories.api_coverage.score, 100);
  // (100*20 + 80*20 + 100*15 + 100*10 + 90*15 + 100*10 + 75*10) / 100
  assert.equal(r.independent.total, 92);
  assert.equal(r.independent.coverage, 100);
  assert.equal(r.independent.grade, 'C', 'confirmed P1 caps the grade at C');
  assert.deepEqual(r.dhGate, { approved: false, failingChecks: [6] });
  assert.equal(r.missing, 1);
});

test('testing without a connection is not verified and drops out of the total', () => {
  const report = load();
  report.categories.testing = { status: 'not_verified', reason: 'no valid connection' };
  const r = scoreReport(report);
  assert.equal(r.categories.testing.score, null);
  assert.equal(r.independent.coverage, 90);
  assert.equal(r.independent.total, Math.round((100 * 20 + 80 * 20 + 100 * 15 + 100 * 10 + 90 * 15 + 100 * 10) / 90));
});

test('grade caps: confirmed P0 caps at D, likely findings do not cap', () => {
  assert.equal(grade(95, [{ severity: 'P0', confidence: 'confirmed' }]), 'D');
  assert.equal(grade(30, [{ severity: 'P1', confidence: 'confirmed' }]), 'F');
  assert.equal(grade(95, [{ severity: 'P0', confidence: 'likely' }]), 'A');
  assert.equal(grade(null), null);
});

test('rejects a finding backed only by an opinion', () => {
  const report = load();
  report.findings[0].evidence = [{ type: 'plug_config', ref: 'Create Contact › V2', quote: 'x' }];
  const { errors } = validateReport(report);
  assert.ok(errors.some((e) => e.includes('needs api_doc, kb_rule, dry_run or analytics')));
});

test('rejects unverified confidence and findings in a not_verified category', () => {
  const report = load();
  report.findings[0].confidence = 'unverified';
  report.categories.input_schema = { status: 'not_verified', reason: 'docs unreachable' };
  const { errors } = validateReport(report);
  assert.ok(errors.some((e) => e.includes('confidence must be confirmed or likely')));
  assert.ok(errors.some((e) => e.includes('is not_verified but has a finding')));
});

test('rejects a numeric-less existing score not labelled Unavailable', () => {
  const report = load();
  report.existingScore = { value: null, display: '85' };
  assert.ok(validateReport(report).errors.some((e) => e.includes('Unavailable')));
});

test('flags secrets anywhere in the report', () => {
  const report = load();
  report.limitations.push({ what: 'auth', reason: `header was Bearer ${'a'.repeat(30)}` });
  report.findings[1].fix.content = `proxy_auth_token: "${'Zx9'.repeat(30)}"`;
  const { errors } = validateReport(report);
  assert.ok(errors.filter((e) => e.includes('remove secrets')).length >= 2);
});

test('warns on likely duplicates', () => {
  const report = load();
  report.findings.push({ ...report.findings[0], id: 'F-003' });
  assert.ok(validateReport(report).warnings.some((w) => w.includes('F-003') && w.includes('F-001')));
});

test('extracts the last json block from a markdown report', () => {
  const md = `# Report\n\n\`\`\`json\n{"a":1}\n\`\`\`\ntext\n\`\`\`json\n${JSON.stringify(load())}\n\`\`\`\n`;
  assert.equal(extractReport(md).app.name, 'Acme CRM');
});
