#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const WEIGHTS = {
  api_coverage: 20,
  input_schema: 20,
  request_response: 15,
  auth_security: 10,
  triggers_pagination: 15,
  error_reliability: 10,
  testing: 10,
};

export const DEDUCTIONS = {
  P0: { confirmed: 40, likely: 20 },
  P1: { confirmed: 20, likely: 10 },
  P2: { confirmed: 8, likely: 4 },
  P3: { confirmed: 2, likely: 1 },
};

const SUPPORTING_EVIDENCE = new Set(['api_doc', 'kb_rule', 'dry_run', 'analytics']);
const REQUIRED_FINDING_KEYS = ['id', 'title', 'severity', 'confidence', 'category', 'check', 'affects', 'location', 'issue', 'evidence', 'fix', 'avoid', 'expectedResult', 'verify'];

const SECRET_PATTERNS = [
  [/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{16,}/, 'auth header value'],
  [/\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{10,}/, 'API key'],
  [/(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|proxy_auth_token)["']?\s*[:=]\s*["'][^"'\s]{8,}["']/i, 'credential assignment'],
  [/[A-Za-z0-9+/]{60,}={0,2}/, 'long opaque token'],
];

export function extractReport(text) {
  try {
    return JSON.parse(text);
  } catch {
    const blocks = [...text.matchAll(/```json\s*\n([\s\S]*?)\n```/g)];
    if (!blocks.length) throw new Error('No JSON and no ```json block found');
    return JSON.parse(blocks.at(-1)[1]);
  }
}

function* strings(value, path = '$') {
  if (typeof value === 'string') yield [path, value];
  else if (Array.isArray(value)) for (const [i, v] of value.entries()) yield* strings(v, `${path}[${i}]`);
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) yield* strings(v, `${path}.${k}`);
}

export function validateReport(report) {
  const errors = [];
  const warnings = [];
  const categories = report?.categories ?? {};
  const findings = Array.isArray(report?.findings) ? report.findings : [];
  if (!Array.isArray(report?.findings)) errors.push('findings must be an array');

  if (report?.existingScore && report.existingScore.value === null && !/unavailable/i.test(report.existingScore.display ?? '')) {
    errors.push('existingScore.value is null but display does not say "Unavailable"');
  }

  const ids = new Set();
  const seenLocations = new Map();
  for (const f of findings) {
    const tag = f?.id ?? '(no id)';
    for (const key of REQUIRED_FINDING_KEYS) {
      if (f?.[key] === undefined || f[key] === '' || (Array.isArray(f[key]) && !f[key].length)) errors.push(`${tag}: missing ${key}`);
    }
    if (ids.has(tag)) errors.push(`${tag}: duplicate id`);
    ids.add(tag);

    if (!DEDUCTIONS[f?.severity]) errors.push(`${tag}: severity must be P0-P3`);
    if (!['confirmed', 'likely'].includes(f?.confidence)) errors.push(`${tag}: confidence must be confirmed or likely (anything weaker belongs in limitations)`);
    if (!(f?.category in WEIGHTS) || f.category === 'testing') errors.push(`${tag}: invalid category ${f?.category}`);

    const status = categories[f?.category]?.status;
    if (status === 'not_verified' || status === 'not_applicable') {
      errors.push(`${tag}: category ${f.category} is ${status} but has a finding`);
    }

    const evidence = Array.isArray(f?.evidence) ? f.evidence : [];
    if (!evidence.some((e) => e?.type === 'plug_config')) errors.push(`${tag}: evidence needs a plug_config item`);
    if (!evidence.some((e) => SUPPORTING_EVIDENCE.has(e?.type))) errors.push(`${tag}: evidence needs api_doc, kb_rule, dry_run or analytics`);
    for (const e of evidence) {
      if (!e?.ref) errors.push(`${tag}: evidence item without ref`);
      if (e?.type === 'api_doc' && !/^https?:\/\//.test(e.ref ?? '')) errors.push(`${tag}: api_doc ref must be a URL`);
      if ((e?.type === 'api_doc' || e?.type === 'kb_rule') && !e.quote) errors.push(`${tag}: ${e.type} evidence needs a quote`);
    }

    if (f?.fix && typeof f.fix.verified !== 'boolean') errors.push(`${tag}: fix.verified must be true or false`);

    const locKey = `${f?.category}|${String(f?.location ?? '').toLowerCase().replace(/\s+/g, ' ').trim()}`;
    if (seenLocations.has(locKey)) warnings.push(`${tag}: same category and location as ${seenLocations.get(locKey)} — merge if same root cause`);
    else seenLocations.set(locKey, tag);
  }

  const testing = categories.testing;
  if (testing?.status === 'scored') {
    if (!Number.isInteger(testing.total) || testing.total < 1 || !Number.isInteger(testing.passed) || testing.passed > testing.total) {
      errors.push('categories.testing is scored but passed/total are missing or invalid');
    }
  }
  for (const [key, c] of Object.entries(categories)) {
    if (c?.status !== 'scored' && !c?.reason) warnings.push(`categories.${key} is ${c?.status} without a reason`);
  }

  for (const [path, value] of strings(report)) {
    if (path.endsWith('.docUrl') || (path.includes('.evidence[') && path.endsWith('.ref') && /^https?:\/\//.test(value))) continue;
    for (const [re, label] of SECRET_PATTERNS) {
      if (re.test(value)) errors.push(`${path}: looks like a ${label} — remove secrets from the report`);
    }
  }

  return { errors, warnings };
}

const GRADES = ['A', 'B', 'C', 'D', 'F'];

export function grade(score, findings = []) {
  if (score === null) return null;
  const byScore = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';
  const confirmed = findings.filter((f) => f.confidence === 'confirmed');
  // A small weighted deduction must not hide an open blocker behind a good letter.
  const cap = confirmed.some((f) => f.severity === 'P0') ? 'D' : confirmed.some((f) => f.severity === 'P1') ? 'C' : 'A';
  return GRADES[Math.max(GRADES.indexOf(byScore), GRADES.indexOf(cap))];
}

export function scoreReport(report) {
  const categories = report.categories ?? {};
  const findings = report.findings ?? [];
  const perCategory = {};

  for (const [key, weight] of Object.entries(WEIGHTS)) {
    const declared = categories[key]?.status;
    if (key === 'testing') {
      const t = categories.testing;
      const scored = t?.status === 'scored' && t.total > 0;
      perCategory[key] = {
        weight,
        status: scored ? 'scored' : (t?.status === 'not_applicable' ? 'not_applicable' : 'not_verified'),
        score: scored ? Math.round((100 * t.passed) / t.total) : null,
        findings: 0,
        deduction: 0,
      };
      continue;
    }
    const mine = findings.filter((f) => f.category === key);
    const deduction = mine.reduce((sum, f) => sum + (DEDUCTIONS[f.severity]?.[f.confidence] ?? 0), 0);
    const status = declared && declared !== 'scored' ? declared : 'scored';
    perCategory[key] = {
      weight,
      status,
      score: status === 'scored' ? Math.max(0, 100 - deduction) : null,
      findings: mine.length,
      deduction,
    };
  }

  const scored = Object.values(perCategory).filter((c) => c.status === 'scored');
  const coverage = scored.reduce((s, c) => s + c.weight, 0);
  const total = coverage ? Math.round(scored.reduce((s, c) => s + c.score * c.weight, 0) / coverage) : null;

  const ratings = (report.dhReviewGate ?? []).filter((r) => r.rating !== null && r.rating !== undefined);
  const failing = ratings.filter((r) => r.rating < 90).map((r) => r.check);
  const dhGate = ratings.length ? { approved: failing.length === 0, failingChecks: failing } : null;

  const counts = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const f of findings) if (f.severity in counts) counts[f.severity] += 1;

  return {
    existing: report.existingScore?.display ?? 'Unavailable',
    independent: { total, grade: grade(total, findings), coverage },
    categories: perCategory,
    dhGate,
    counts,
    missing: (report.coverageMatrix ?? []).filter((r) => r.status === 'missing-core' || r.status === 'missing-optional').length,
    limitations: (report.limitations ?? []).length,
  };
}

function printTable(result) {
  const lines = [];
  lines.push(`Existing score:    ${result.existing}`);
  const ind = result.independent;
  lines.push(`Independent score: ${ind.total ?? 'n/a'}/100 · grade ${ind.grade ?? 'n/a'} · coverage ${ind.coverage}%`);
  if (result.dhGate) lines.push(`DH review gate:    ${result.dhGate.approved ? 'Approved' : `Rejected (checks ${result.dhGate.failingChecks.join(', ')})`}`);
  lines.push(`Issues: ${result.counts.P0} P0 · ${result.counts.P1} P1 · ${result.counts.P2} P2 · ${result.counts.P3} P3 | missing ${result.missing} | limitations ${result.limitations}`);
  lines.push('');
  lines.push('category             weight  status          score  findings  deduction');
  for (const [key, c] of Object.entries(result.categories)) {
    lines.push(`${key.padEnd(20)} ${String(c.weight).padStart(6)}  ${c.status.padEnd(14)} ${String(c.score ?? '—').padStart(6)}  ${String(c.findings).padStart(8)}  ${String(c.deduction).padStart(9)}`);
  }
  return lines.join('\n');
}

function main(argv) {
  const file = argv.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('usage: node scripts/score-audit.mjs <report.json|report.md> [--json]');
    return 2;
  }
  const report = extractReport(readFileSync(file, 'utf8'));
  const { errors, warnings } = validateReport(report);
  for (const w of warnings) console.error(`warning: ${w}`);
  for (const e of errors) console.error(`error: ${e}`);
  if (errors.length) {
    console.error(`\n${errors.length} validation error(s): fix the report before scoring.`);
    return 1;
  }
  const result = scoreReport(report);
  console.log(argv.includes('--json') ? JSON.stringify(result, null, 2) : printTable(result));
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
