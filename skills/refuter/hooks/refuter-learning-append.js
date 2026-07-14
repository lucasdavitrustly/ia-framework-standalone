#!/usr/bin/env node
// refuter — Learning Append Hook
// Event: PostToolUse (matcher: Write, file contains REFUTATION.md)
// Extracts antipatterns with budget-controlled curadoria
// Exit 0 always (never blocks)

const fs = require('fs');
const path = require('path');

const BUDGET_CHARS = 1500;
const MAX_ENTRIES = 30;

function parseEntries(content) {
  const lines = content.split('\n').filter(l => l.startsWith('- ['));
  return lines.map(line => {
    const match = line.match(/^- \[(\d+)x\] (\w+): (.+?) \(last: ([\d-]+)\)$/);
    if (!match) return null;
    return { counter: parseInt(match[1], 10), category: match[2], pattern: match[3], lastDate: match[4], raw: line };
  }).filter(Boolean);
}

function serializeEntries(entries) {
  return entries.map(e =>
    `- [${e.counter}x] ${e.category}: ${e.pattern} (last: ${e.lastDate})`
  ).join('\n');
}

function extractNewPatterns(refutationContent) {
  const findings = refutationContent.match(/### \[(BLOCKER|WARNING|INFO)\][^\n]*\n[\s\S]*?(?=### \[|$)/g) || [];
  const patterns = [];

  for (const block of findings) {
    const dimMatch = block.match(/\*\*Dimension\*\*:\s*(\w+)/);
    const titleMatch = block.match(/^### \[\w+\]\s*\S+\s*[—–-]\s*(.+)$/m);
    if (dimMatch && titleMatch) {
      patterns.push({
        category: dimMatch[1],
        pattern: titleMatch[1].trim().substring(0, 80)
      });
    }
  }
  return patterns;
}

function curate(existingEntries, newPatterns, today) {
  // Step 1: Merge new patterns into existing (increment counter or add)
  for (const np of newPatterns) {
    const existing = existingEntries.find(e =>
      e.category === np.category &&
      (e.pattern.toLowerCase().includes(np.pattern.toLowerCase().substring(0, 20)) ||
       np.pattern.toLowerCase().includes(e.pattern.toLowerCase().substring(0, 20)))
    );
    if (existing) {
      existing.counter++;
      existing.lastDate = today;
    } else {
      existingEntries.push({ counter: 1, category: np.category, pattern: np.pattern, lastDate: today });
    }
  }

  // Step 2: Sort by counter (most recurrent first)
  existingEntries.sort((a, b) => b.counter - a.counter);

  // Step 3: Apply max entries cap
  if (existingEntries.length > MAX_ENTRIES) {
    existingEntries = existingEntries.slice(0, MAX_ENTRIES);
  }

  // Step 4: Apply budget hard cap
  let result = serializeEntries(existingEntries);
  while (result.length > BUDGET_CHARS && existingEntries.length > 1) {
    existingEntries.pop(); // Remove lowest-counter entry
    result = serializeEntries(existingEntries);
  }

  return existingEntries;
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
    const toolName = data.tool_name || '';
    const filePath = data.tool_input?.file_path || data.tool_input?.path || '';

    // Only trigger on Write to REFUTATION.md
    if (!['Write', 'write', 'Edit', 'edit'].includes(toolName)) process.exit(0);
    if (!filePath.includes('REFUTATION.md')) process.exit(0);

    const refuterDir = path.join(cwd, '.refuter');
    if (!fs.existsSync(refuterDir)) fs.mkdirSync(refuterDir, { recursive: true });

    const antipatternsPath = path.join(refuterDir, 'antipatterns.md');
    const today = new Date().toISOString().split('T')[0];

    // Read existing antipatterns
    let existingEntries = [];
    if (fs.existsSync(antipatternsPath)) {
      const existing = fs.readFileSync(antipatternsPath, 'utf8');
      existingEntries = parseEntries(existing);
    }

    // Read the REFUTATION.md that was just written
    const refutationPath = path.resolve(cwd, filePath);
    if (!fs.existsSync(refutationPath)) process.exit(0);

    const refutationContent = fs.readFileSync(refutationPath, 'utf8');
    const newPatterns = extractNewPatterns(refutationContent);

    if (newPatterns.length === 0) process.exit(0);

    // Curate: merge, sort, budget-cap
    const curated = curate(existingEntries, newPatterns, today);

    // Write curated antipatterns
    const header = `# TrustlyAB Refuter Antipatterns\n# Budget: ${BUDGET_CHARS} chars | Entries: ${curated.length}/${MAX_ENTRIES}\n# Auto-curated — counter tracks recurrence, lowest-counter entries are pruned\n\n`;
    const output = header + serializeEntries(curated) + '\n';

    fs.writeFileSync(antipatternsPath, output);
    process.exit(0);
  } catch (e) {
    process.exit(0);
  }
});
