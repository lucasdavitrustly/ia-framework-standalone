#!/usr/bin/env node
// refuter — Orchestration Completeness Hook (SDD-agnostic)
// Event: Stop (blocks if orchestrator hasn't completed all expected outputs)
// Verifies against .refuter/session.json { docs, roles, specDir }:
//   - REFUTATION.md exists with an "Approved Findings" section
//   - one REFUTATION-<ROLE>.html per requested role (complete, non-stub)
//   - multi-document coverage (findings reference the session's docs)
// If session.json is absent, the run is unmanaged → do not block (exit 0).
// Exit 2 = block stop | Exit 0 = allow

const fs = require('fs');
const path = require('path');

const MAX_RETRIES = 3;

function readSession(refuterDir) {
  try {
    const raw = fs.readFileSync(path.join(refuterDir, 'session.json'), 'utf8');
    const s = JSON.parse(raw);
    if (!Array.isArray(s.docs) || !Array.isArray(s.roles)) return null;
    return s;
  } catch (_) {
    return null;
  }
}

// Derive the finding ID prefix from a document filename, matching the analyst:
// basename without extension, uppercased, non-alphanumerics stripped.
function idPrefixFor(doc) {
  const base = path.basename(doc).replace(/\.[^.]+$/, '');
  return base.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 5000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const cwd = data.cwd || process.cwd();

    const refuterDir = path.join(cwd, '.refuter');
    const session = readSession(refuterDir);

    // No managed session → nothing to enforce.
    if (!session) process.exit(0);

    // Retry guard to avoid infinite loops.
    const counterFile = path.join(refuterDir, '.completeness-retries');
    let retries = 0;
    if (fs.existsSync(counterFile)) {
      retries = parseInt(fs.readFileSync(counterFile, 'utf8').trim(), 10) || 0;
    }
    if (retries >= MAX_RETRIES) {
      try { fs.unlinkSync(counterFile); } catch (_) {}
      process.exit(0);
    }

    // Resolve the spec directory: prefer session.specDir, else where REFUTATION.md is.
    const searchDirs = [];
    if (session.specDir) searchDirs.push(session.specDir);
    searchDirs.push(path.join(cwd, 'specs'), cwd);

    let specDir = null;
    for (const d of searchDirs) {
      if (d && fs.existsSync(path.join(d, 'REFUTATION.md'))) { specDir = d; break; }
    }

    const missing = [];

    // Check 1: REFUTATION.md exists.
    if (!specDir) {
      missing.push('REFUTATION.md — Main report not generated');
    }

    // Check 2: one HTML report per requested role (complete, non-stub).
    const roles = session.roles.map(r => String(r).toUpperCase());
    const reportSearch = specDir ? [specDir, cwd, path.join(cwd, 'specs')]
                                 : [path.join(cwd, 'specs'), cwd];
    for (const role of roles) {
      const htmlFile = `REFUTATION-${role}.html`;
      let foundPath = null;
      for (const d of reportSearch) {
        const p = path.join(d, htmlFile);
        if (fs.existsSync(p)) { foundPath = p; break; }
      }
      if (!foundPath) {
        missing.push(`${htmlFile} — report for role "${role}" not generated`);
        continue;
      }
      const content = fs.readFileSync(foundPath, 'utf8');
      if (content.length < 500) {
        missing.push(`${htmlFile} appears to be a stub (${content.length} chars)`);
      }
      if (content.includes('{{') && content.includes('}}')) {
        missing.push(`${htmlFile} still contains unfilled template placeholders ({{ }})`);
      }
    }

    // Check 3: REFUTATION.md content quality — approved section + doc coverage.
    if (specDir) {
      const refutation = fs.readFileSync(path.join(specDir, 'REFUTATION.md'), 'utf8');
      const lower = refutation.toLowerCase();

      const hasApproved = refutation.includes('Approved Finding') || refutation.includes('## Approved');
      if (!hasApproved) {
        missing.push('REFUTATION.md missing "Approved Findings" section — adjudication may not have occurred');
      }

      // Multi-document coverage: for a multi-doc run, require evidence that more
      // than one of the session documents was analysed (by derived ID prefix or
      // by filename mention). Single-doc runs are exempt.
      if (session.docs.length > 1) {
        const byPrefix = session.docs.filter(d => refutation.includes(idPrefixFor(d) + '-'));
        const byName = session.docs.filter(d => lower.includes(path.basename(d).toLowerCase()));
        const covered = Math.max(byPrefix.length, byName.length);
        const required = Math.min(session.docs.length, 2);
        if (covered < required) {
          missing.push(`Multi-document coverage insufficient — only ${covered} of ${session.docs.length} session document(s) appear in findings.`);
        }
      }
    }

    if (missing.length > 0) {
      if (!fs.existsSync(refuterDir)) fs.mkdirSync(refuterDir, { recursive: true });
      fs.writeFileSync(counterFile, String(retries + 1));

      const roleList = roles.map(r => `REFUTATION-${r}.html`).join(', ');
      process.stderr.write(
        `Orchestration incomplete (${missing.length} issue(s)):\n` +
        missing.map(m => `  ✗ ${m}`).join('\n') +
        '\n\n' +
        'Required outputs for this run:\n' +
        `  1. Spawn one refuter-analyst per document: ${session.docs.join(', ')}\n` +
        '  2. Adjudicate all findings → write REFUTATION.md (with Approved Findings)\n' +
        `  3. Spawn one refuter-report-writer per role → ${roleList}\n` +
        '\nComplete ALL steps before finishing.'
      );
      process.exit(2);
    }

    try { fs.unlinkSync(counterFile); } catch (_) {}
    process.exit(0);
  } catch (e) {
    process.exit(0);
  }
});
