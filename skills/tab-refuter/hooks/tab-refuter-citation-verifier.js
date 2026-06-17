#!/usr/bin/env node
// tab-refuter — Citation Verifier Hook
// Event: Stop (anti-hallucination — re-reads cited files to confirm citations exist)
// Exit 2 = block stop | Exit 0 = allow

const fs = require('fs');
const path = require('path');

const MAX_RETRIES = 3;
const FUZZY_THRESHOLD = 0.75;

function similarity(a, b) {
  const la = a.toLowerCase().trim();
  const lb = b.toLowerCase().trim();
  if (la === lb) return 1.0;
  if (la.length === 0 || lb.length === 0) return 0;
  // Simple character overlap ratio
  const shorter = la.length < lb.length ? la : lb;
  const longer = la.length >= lb.length ? la : lb;
  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) matches++;
  }
  return matches / longer.length;
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

    // Check retry counter to avoid infinite loops
    const counterFile = path.join(cwd, '.tab-refuter', '.citation-retries');
    let retries = 0;
    if (fs.existsSync(counterFile)) {
      retries = parseInt(fs.readFileSync(counterFile, 'utf8').trim(), 10) || 0;
    }
    if (retries >= MAX_RETRIES) {
      // Force allow after max retries — produce partial report
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
    if (!refutationPath) process.exit(0);

    const content = fs.readFileSync(refutationPath, 'utf8');

    // Extract citations: **Source**: file:line — "text"
    const sourceRegex = /\*\*Source\*\*:\s*([^:]+):(\d+)\s*[—–-]\s*"([^"]+)"/g;
    const hallucinations = [];
    let match;

    while ((match = sourceRegex.exec(content)) !== null) {
      const [, filePath, lineStr, citedText] = match;
      const line = parseInt(lineStr, 10);
      const resolvedPath = path.resolve(cwd, filePath.trim());

      if (!fs.existsSync(resolvedPath)) {
        hallucinations.push({ file: filePath.trim(), line, text: citedText, reason: 'file not found' });
        continue;
      }

      try {
        const lines = fs.readFileSync(resolvedPath, 'utf8').split('\n');
        // Check a window around the cited line (±3 lines)
        const start = Math.max(0, line - 4);
        const end = Math.min(lines.length, line + 3);
        const window = lines.slice(start, end).join(' ');

        if (similarity(citedText, window) < FUZZY_THRESHOLD) {
          // Check full file as fallback
          const fullContent = lines.join(' ');
          if (!fullContent.toLowerCase().includes(citedText.toLowerCase().substring(0, 30))) {
            hallucinations.push({ file: filePath.trim(), line, text: citedText, reason: 'text not found at cited location' });
          }
        }
      } catch (_) {
        // Can't read file — skip
      }
    }

    if (hallucinations.length > 0) {
      // Increment retry counter
      const refuterDir = path.join(cwd, '.tab-refuter');
      if (!fs.existsSync(refuterDir)) fs.mkdirSync(refuterDir, { recursive: true });
      fs.writeFileSync(counterFile, String(retries + 1));

      const details = hallucinations.map(h =>
        `  ${h.file}:${h.line} — "${h.text.substring(0, 50)}..." (${h.reason})`
      ).join('\n');
      process.stderr.write(
        `HALLUCINATION DETECTED: ${hallucinations.length} citation(s) cannot be verified:\n${details}\n\nRe-read the source files and correct the citations.`
      );
      process.exit(2);
    }

    // Success — clean counter
    try { fs.unlinkSync(counterFile); } catch (_) {}
    process.exit(0);
  } catch (e) {
    process.exit(0);
  }
});
