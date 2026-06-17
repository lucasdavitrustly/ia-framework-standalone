#!/usr/bin/env node
// tab-refuter — Orchestration Completeness Hook
// Event: Stop (blocks if orchestrator hasn't completed all expected outputs)
// Verifies: 6 analyst calls + REFUTATION.md + 3 HTML reports
// Exit 2 = block stop | Exit 0 = allow

const fs = require('fs');
const path = require('path');

const MAX_RETRIES = 3;

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 5000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const cwd = data.cwd || process.cwd();

    // Check retry counter to avoid infinite loops
    const refuterDir = path.join(cwd, '.tab-refuter');
    const counterFile = path.join(refuterDir, '.completeness-retries');
    let retries = 0;
    if (fs.existsSync(counterFile)) {
      retries = parseInt(fs.readFileSync(counterFile, 'utf8').trim(), 10) || 0;
    }
    if (retries >= MAX_RETRIES) {
      try { fs.unlinkSync(counterFile); } catch (_) {}
      process.exit(0);
    }

    // Determine spec directory
    const specCandidates = [
      path.join(cwd, 'specs'),
      cwd
    ];
    let specDir = null;
    for (const d of specCandidates) {
      if (fs.existsSync(path.join(d, 'REFUTATION.md'))) {
        specDir = d;
        break;
      }
    }

    const missing = [];

    // Check 1: REFUTATION.md exists
    if (!specDir) {
      missing.push('REFUTATION.md — Main report not generated');
    }

    // Check 2: All 3 HTML reports exist
    const expectedHtmlReports = ['REFUTATION-PM.html', 'REFUTATION-DEV.html', 'REFUTATION-QA.html'];
    const searchDir = specDir || path.join(cwd, 'specs');

    for (const htmlFile of expectedHtmlReports) {
      const candidates = [
        path.join(searchDir, htmlFile),
        path.join(cwd, htmlFile),
        path.join(cwd, 'specs', htmlFile)
      ];
      const found = candidates.some(p => fs.existsSync(p));
      if (!found) {
        missing.push(`${htmlFile} — Role-specific report not generated`);
      }
    }

    // Check 3: If REFUTATION.md exists, verify it has findings from multiple documents
    // (proves multiple analysts ran, not just one)
    if (specDir) {
      const refutation = fs.readFileSync(path.join(specDir, 'REFUTATION.md'), 'utf8');

      // Check for evidence of multi-document analysis
      const docIds = ['SPEC-', 'REQ-', 'PLAN-', 'TASK-', 'RES-', 'QS-'];
      const foundDocPrefixes = docIds.filter(prefix => refutation.includes(prefix));

      if (foundDocPrefixes.length < 3) {
        // Also check alternative ID patterns or document mentions
        const docsAnalyzed = ['spec.md', 'requirements.md', 'plan.md', 'tasks.md', 'research.md', 'quickstart.md'];
        const mentionedDocs = docsAnalyzed.filter(doc => refutation.toLowerCase().includes(doc));

        if (mentionedDocs.length < 4) {
          missing.push(`Multi-document coverage insufficient — only ${Math.max(foundDocPrefixes.length, mentionedDocs.length)} documents appear in findings. Expected analysis of 6 documents via 6 separate subagents.`);
        }
      }

      // Check that the report has both approved and rejected sections (proves adjudication happened)
      const hasApproved = refutation.includes('Approved Finding') || refutation.includes('## Approved');
      const hasRejected = refutation.includes('Rejected Finding') || refutation.includes('## Rejected');
      if (!hasApproved) {
        missing.push('REFUTATION.md missing "Approved Findings" section — adjudication may not have occurred');
      }
    }

    // Check 4: Verify HTML reports are not empty/stubs
    for (const htmlFile of expectedHtmlReports) {
      const candidates = [
        path.join(searchDir, htmlFile),
        path.join(cwd, htmlFile),
        path.join(cwd, 'specs', htmlFile)
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          const content = fs.readFileSync(p, 'utf8');
          if (content.length < 500) {
            missing.push(`${htmlFile} appears to be a stub (${content.length} chars) — expected a complete HTML report`);
          }
          // Verify it has actual finding content (not just template)
          if (content.includes('{{') && content.includes('}}')) {
            missing.push(`${htmlFile} still contains unfilled template placeholders ({{ }}) — report writer did not complete`);
          }
          break;
        }
      }
    }

    if (missing.length > 0) {
      if (!fs.existsSync(refuterDir)) fs.mkdirSync(refuterDir, { recursive: true });
      fs.writeFileSync(counterFile, String(retries + 1));

      process.stderr.write(
        `Orchestration incomplete (${missing.length} issue(s)):\n` +
        missing.map(m => `  ✗ ${m}`).join('\n') +
        '\n\n' +
        'Required outputs:\n' +
        '  1. Spawn 6 tab-refuter-analyst subagents (one per document)\n' +
        '  2. Adjudicate all findings → write REFUTATION.md\n' +
        '  3. Spawn 3 tab-refuter-report-writer subagents → REFUTATION-PM.html, REFUTATION-DEV.html, REFUTATION-QA.html\n' +
        '\nComplete ALL steps before finishing.'
      );
      process.exit(2);
    }

    // All checks passed — clean counter
    try { fs.unlinkSync(counterFile); } catch (_) {}
    process.exit(0);
  } catch (e) {
    process.exit(0);
  }
});
