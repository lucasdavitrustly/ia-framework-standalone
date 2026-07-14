#!/usr/bin/env node
// Tests for refuter-orchestration-complete.js (SDD-agnostic contract).
//
// New contract: the hook validates the run against .refuter/session.json
// { docs:[...], roles:[...], specDir } instead of the hardcoded 6 SpecKit
// filenames and fixed PM/DEV/QA reports.
//
//  - With a custom role set (e.g. ["dev"]), only REFUTATION-DEV.html is
//    required; PM/QA absence must NOT block.
//  - Multi-doc coverage is checked against session docs (derived ID prefixes),
//    not SpecKit names.
//  - A complete run (REFUTATION.md + approved section + all role reports +
//    doc coverage) exits 0.
//  - Missing a required role report exits 2 (block).
//  - No session.json → exit 0 (unmanaged run, do not block).
//
// Runs the hook as the IDE does: pipe JSON {cwd} on stdin, observe exit code.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const HOOK = path.resolve(__dirname, '../../skills/refuter/hooks/refuter-orchestration-complete.js');

let PASS = 0, FAIL = 0;
const pass = m => { PASS++; console.log('PASS: ' + m); };
const fail = m => { FAIL++; console.error('FAIL: ' + m); };

function runHook(cwd) {
  try {
    execFileSync('node', [HOOK], { input: JSON.stringify({ cwd }), stdio: ['pipe', 'pipe', 'pipe'] });
    return 0;
  } catch (e) {
    return e.status == null ? -1 : e.status;
  }
}

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refuter-oc-'));
  fs.mkdirSync(path.join(dir, '.refuter'), { recursive: true });
  return dir;
}

function writeSession(dir, session) {
  fs.writeFileSync(path.join(dir, '.refuter', 'session.json'), JSON.stringify(session));
}

const APPROVED_MD = (docs) => `# Refutation Report
## Approved Findings
### [BLOCKER] ${docs[0].split('.')[0].toUpperCase()}-001 — Example
**Source**: ${docs[0]}:10 — "x"
## Rejected Findings
(none)
`;

const goodHtml = `<!DOCTYPE html><html><head><title>R</title></head><body>${'x'.repeat(600)}</body></html>`;

// --- Test 1: custom single-role run (dev only) is complete -> exit 0 --------
function t1() {
  const dir = tmpProject();
  writeSession(dir, { docs: ['spec.md'], roles: ['dev'], specDir: dir });
  fs.writeFileSync(path.join(dir, 'REFUTATION.md'), APPROVED_MD(['spec.md']));
  fs.writeFileSync(path.join(dir, 'REFUTATION-DEV.html'), goodHtml);
  const code = runHook(dir);
  code === 0 ? pass('T1 dev-only complete run -> exit 0 (PM/QA not required)')
             : fail('T1 expected 0 got ' + code);
}

// --- Test 2: missing the required role report -> exit 2 ---------------------
function t2() {
  const dir = tmpProject();
  writeSession(dir, { docs: ['spec.md'], roles: ['dev'], specDir: dir });
  fs.writeFileSync(path.join(dir, 'REFUTATION.md'), APPROVED_MD(['spec.md']));
  // no REFUTATION-DEV.html
  const code = runHook(dir);
  code === 2 ? pass('T2 missing required dev report -> exit 2 (block)')
             : fail('T2 expected 2 got ' + code);
}

// --- Test 3: default pm/dev/qa run complete -> exit 0 (parity) --------------
function t3() {
  const dir = tmpProject();
  writeSession(dir, { docs: ['spec.md', 'plan.md', 'tasks.md'], roles: ['pm', 'dev', 'qa'], specDir: dir });
  fs.writeFileSync(path.join(dir, 'REFUTATION.md'),
    APPROVED_MD(['spec.md']) + '\nplan.md tasks.md referenced\n');
  for (const r of ['PM', 'DEV', 'QA']) fs.writeFileSync(path.join(dir, `REFUTATION-${r}.html`), goodHtml);
  const code = runHook(dir);
  code === 0 ? pass('T3 default pm/dev/qa complete -> exit 0')
             : fail('T3 expected 0 got ' + code);
}

// --- Test 4: extra role (arch) required beyond pm/dev/qa --------------------
function t4() {
  const dir = tmpProject();
  writeSession(dir, { docs: ['spec.md'], roles: ['arch'], specDir: dir });
  fs.writeFileSync(path.join(dir, 'REFUTATION.md'), APPROVED_MD(['spec.md']));
  // Only PM/DEV/QA present, but session requires "arch" -> must block.
  for (const r of ['PM', 'DEV', 'QA']) fs.writeFileSync(path.join(dir, `REFUTATION-${r}.html`), goodHtml);
  const code = runHook(dir);
  code === 2 ? pass('T4 custom role "arch" required but absent -> exit 2')
             : fail('T4 expected 2 got ' + code);
}

// --- Test 5: no session.json -> exit 0 (unmanaged, do not block) ------------
function t5() {
  const dir = tmpProject();
  fs.rmSync(path.join(dir, '.refuter', 'session.json'), { force: true });
  const code = runHook(dir);
  code === 0 ? pass('T5 no session.json -> exit 0 (no block)')
             : fail('T5 expected 0 got ' + code);
}

[t1, t2, t3, t4, t5].forEach(t => t());
console.log(`\n${PASS} passed, ${FAIL} failed`);
process.exit(FAIL === 0 ? 0 : 1);
