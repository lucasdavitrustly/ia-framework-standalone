#!/usr/bin/env node
// refuter — Audit Trail Hook
// Event: PostToolUse (matcher: Read|Write|Edit)
// Logs every action with phase context for reproducibility
// Exit 0 always (never blocks)

const fs = require('fs');
const path = require('path');

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const cwd = data.cwd || process.cwd();
    const toolName = data.tool_name || 'unknown';
    const toolInput = data.tool_input || {};
    const filePath = toolInput.file_path || toolInput.path || toolInput.pattern || '';

    const refuterDir = path.join(cwd, '.refuter');
    if (!fs.existsSync(refuterDir)) {
      fs.mkdirSync(refuterDir, { recursive: true });
    }

    const trailPath = path.join(refuterDir, 'audit-trail.jsonl');
    const entry = {
      timestamp: new Date().toISOString(),
      tool: toolName,
      file: filePath,
      session_id: data.session_id || null
    };

    fs.appendFileSync(trailPath, JSON.stringify(entry) + '\n');
    process.exit(0);
  } catch (e) {
    process.exit(0);
  }
});
