#!/usr/bin/env node
// tab-refuter — Convergence Gate Hook
// Event: Stop (blocks if analysis coverage is incomplete)
// Exit 2 = block stop | Exit 0 = allow

const fs = require('fs');
const path = require('path');

const REQUIRED_DOCS = ['spec.md', 'research.md', 'quickstart.md', 'requirements.md', 'plan.md', 'tasks.md'];
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

    // Check retry counter
    const counterFile = path.join(cwd, '.tab-refuter', '.convergence-retries');
    let retries = 0;
    if (fs.existsSync(counterFile)) {
      retries = parseInt(fs.readFileSync(counterFile, 'utf8').trim(), 10) || 0;
    }
    if (retries >= MAX_RETRIES) {
      try { fs.unlinkSync(counterFile); } catch (_) {}
      process.exit(0);
    }

    const candidates = [
      path.join(cwd, 'specs', 'REFUTATION.md'),
      path.join(cwd, 'REFUTATION.md')
    ];
    let refutationPath = null;
    for (const p of candidates) {
      if (fs.existsSync(p)) { refutationPath = p; break; }
    }
    if (!refutationPath) {
      process.stderr.write('REFUTATION.md not generated. Complete the analysis before finishing.');
      process.exit(2);
    }

    const content = fs.readFileSync(refutationPath, 'utf8');
    const contentLower = content.toLowerCase();
    const issues = [];

    // Check 1: Were all required docs analyzed?
    const unanalyzed = REQUIRED_DOCS.filter(doc => !contentLower.includes(doc));
    if (unanalyzed.length > 0) {
      issues.push(`Documents not analyzed: ${unanalyzed.join(', ')}`);
    }

    // Check 2: Was gold standard research performed?
    const hasExternalRef = contentLower.includes('http') ||
      contentLower.includes('context7') ||
      contentLower.includes('rfc') ||
      contentLower.includes('owasp') ||
      contentLower.includes('mdn') ||
      contentLower.includes('gold standard');
    if (!hasExternalRef) {
      issues.push('No gold standard research detected. Query context7 or websearch for industry best practices.');
    }

    // Check 3: Are there any BLOCKER findings with insufficient evidence?
    const blockerCount = (content.match(/### \[BLOCKER\]/g) || []).length;
    const warningCount = (content.match(/### \[WARNING\]/g) || []).length;
    const infoCount = (content.match(/### \[INFO\]/g) || []).length;
    const totalFindings = blockerCount + warningCount + infoCount;

    if (totalFindings === 0) {
      issues.push('No findings generated. Analysis appears incomplete.');
    }

    // Check 4: Coverage section exists
    if (!contentLower.includes('coverage') && !contentLower.includes('documents analyzed')) {
      issues.push('Missing coverage section. Document which sections of each file were analyzed.');
    }

    if (issues.length > 0) {
      const refuterDir = path.join(cwd, '.tab-refuter');
      if (!fs.existsSync(refuterDir)) fs.mkdirSync(refuterDir, { recursive: true });
      fs.writeFileSync(counterFile, String(retries + 1));

      process.stderr.write(
        `Convergence gate: Analysis incomplete (${issues.length} issue(s)):\n` +
        issues.map(i => `  • ${i}`).join('\n') +
        '\n\nComplete the missing analysis before finishing.'
      );
      process.exit(2);
    }

    try { fs.unlinkSync(counterFile); } catch (_) {}
    process.exit(0);
  } catch (e) {
    process.exit(0);
  }
});
