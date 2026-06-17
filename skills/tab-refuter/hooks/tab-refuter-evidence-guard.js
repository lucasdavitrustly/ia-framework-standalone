#!/usr/bin/env node
// tab-refuter — Evidence Guard Hook
// Event: Stop (blocks finalization if findings lack grounded evidence)
// Exit 2 = block stop | Exit 0 = allow

const fs = require('fs');
const path = require('path');

const REQUIRED_FIELDS = ['**Dimension**:', '**Source**:', '**Counter-reference**:', '**Impact**:', '**Recommendation**:'];

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 5000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const cwd = data.cwd || process.cwd();

    // Find REFUTATION.md in specs/ or project root
    const candidates = [
      path.join(cwd, 'specs', 'REFUTATION.md'),
      path.join(cwd, 'REFUTATION.md')
    ];

    let refutationPath = null;
    for (const p of candidates) {
      if (fs.existsSync(p)) { refutationPath = p; break; }
    }

    if (!refutationPath) {
      process.stderr.write('REFUTATION.md not found. Generate the refutation report before finishing.');
      process.exit(2);
    }

    const content = fs.readFileSync(refutationPath, 'utf8');
    const findings = content.split(/^### \[(BLOCKER|WARNING|INFO)\]/m).slice(1);

    if (findings.length === 0) {
      process.stderr.write('REFUTATION.md contains no findings. Perform analysis before finishing.');
      process.exit(2);
    }

    // Check each finding has all required fields
    const findingBlocks = content.match(/### \[(BLOCKER|WARNING|INFO)\][^\n]*\n[\s\S]*?(?=### \[|$)/g) || [];
    const incomplete = [];

    for (const block of findingBlocks) {
      const firstLine = block.split('\n')[0];
      const id = firstLine.replace(/^### \[(BLOCKER|WARNING|INFO)\]\s*/, '').split('—')[0].trim();
      const missing = REQUIRED_FIELDS.filter(f => !block.includes(f));
      if (missing.length > 0) {
        incomplete.push({ id, missing });
      }
    }

    if (incomplete.length > 0) {
      const details = incomplete.map(f =>
        `Finding ${f.id}: lacks ${f.missing.join(', ')}`
      ).join('\n');
      process.stderr.write(
        `Evidence guard: ${incomplete.length} finding(s) lack grounded evidence.\n${details}\n\nProvide: source citation, counter-reference, and severity for each.`
      );
      process.exit(2);
    }

    process.exit(0);
  } catch (e) {
    // Parse error or unexpected — don't block
    process.exit(0);
  }
});
