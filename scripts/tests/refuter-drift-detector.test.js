#!/usr/bin/env node
// Tests for refuter-drift-detector.js (SDD-agnostic contract).
//
// Advisory hook (always exit 0). It classifies the just-read file as a spec
// doc or a code file. New contract: "spec doc" is determined from the current
// run's .refuter/session.json docs (any filename), NOT the hardcoded SpecKit
// names. Reading a session doc emits no drift context; reading code with drift
// signals emits additionalContext.
//
// Runs the hook as the IDE does: pipe a PostToolUse payload on stdin.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const HOOK = path.resolve(__dirname, '../../skills/refuter/hooks/refuter-drift-detector.js');

let PASS = 0, FAIL = 0;
const pass = m => { PASS++; console.log('PASS: ' + m); };
const fail = m => { FAIL++; console.error('FAIL: ' + m); };

function runHook(payload) {
  const out = execFileSync('node', [HOOK], { input: JSON.stringify(payload), stdio: ['pipe', 'pipe', 'pipe'] });
  return out.toString();
}

function tmpProject(session) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refuter-dd-'));
  if (session) {
    fs.mkdirSync(path.join(dir, '.refuter'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.refuter', 'session.json'), JSON.stringify(session));
  }
  return dir;
}

const CODE_WITH_DRIFT = 'const timeout = 30;\n// TODO: implement retry\nfunction f(){}';

// --- Test 1: reading a custom-named session doc -> no drift context ---------
function t1() {
  const dir = tmpProject({ docs: ['design.md', 'openspec.md'], roles: ['dev']});
  const out = runHook({
    tool_name: 'Read',
    tool_input: { file_path: path.join(dir, 'design.md') },
    tool_response: CODE_WITH_DRIFT, // even with drift-like text, a spec doc is exempt
    cwd: dir
  });
  out.trim() === '' ? pass('T1 session doc (design.md) -> no drift output')
                    : fail('T1 expected empty output, got: ' + out.slice(0, 80));
}

// --- Test 2: reading a code file with drift -> emits additionalContext ------
function t2() {
  const dir = tmpProject({ docs: ['design.md'], roles: ['dev']});
  const out = runHook({
    tool_name: 'Read',
    tool_input: { file_path: path.join(dir, 'src/server.js') },
    tool_response: CODE_WITH_DRIFT,
    cwd: dir
  });
  let ok = false;
  try { ok = /DRIFT SIGNALS/.test(JSON.parse(out).hookSpecificOutput.additionalContext); } catch (_) {}
  ok ? pass('T2 code file with drift -> additionalContext emitted')
     : fail('T2 expected drift context, got: ' + out.slice(0, 80));
}

// --- Test 3: SpecKit-named doc still exempt via fallback (no session) -------
function t3() {
  const dir = tmpProject(null); // no session.json
  const out = runHook({
    tool_name: 'Read',
    tool_input: { file_path: path.join(dir, 'spec.md') },
    tool_response: CODE_WITH_DRIFT,
    cwd: dir
  });
  out.trim() === '' ? pass('T3 no session: SpecKit-named spec.md exempt (fallback)')
                    : fail('T3 expected empty output, got: ' + out.slice(0, 80));
}

// --- Test 4: non-Read tool -> no output (unchanged behavior) ----------------
function t4() {
  const dir = tmpProject({ docs: ['design.md'], roles: ['dev']});
  const out = runHook({
    tool_name: 'Write',
    tool_input: { file_path: path.join(dir, 'src/server.js') },
    tool_response: CODE_WITH_DRIFT,
    cwd: dir
  });
  out.trim() === '' ? pass('T4 non-Read tool -> no output')
                    : fail('T4 expected empty output, got: ' + out.slice(0, 80));
}

[t1, t2, t3, t4].forEach(t => t());
console.log(`\n${PASS} passed, ${FAIL} failed`);
process.exit(FAIL === 0 ? 0 : 1);
