#!/usr/bin/env node
// tab-refuter — Drift Detector Hook
// Event: PostToolUse (matcher: Read)
// Advisory — injects context about spec↔code divergences
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
    const toolName = data.tool_name;

    // Only process Read tool calls
    if (toolName !== 'Read' && toolName !== 'read') {
      process.exit(0);
    }

    const filePath = data.tool_input?.file_path || data.tool_input?.path || '';
    const toolResponse = data.tool_response || '';
    const cwd = data.cwd || process.cwd();

    // Detect if we just read a code file (not a spec/doc file)
    const specPatterns = [/spec\.md/i, /requirements\.md/i, /plan\.md/i, /tasks\.md/i, /research\.md/i, /quickstart\.md/i, /REFUTATION\.md/i, /antipatterns\.md/i];
    const isSpecFile = specPatterns.some(p => p.test(filePath));

    if (isSpecFile) {
      // Reading a spec file — extract claims to track
      // We output nothing, just let the agent read naturally
      process.exit(0);
    }

    // Reading a code file — check for common drift patterns
    const responseText = typeof toolResponse === 'string' ? toolResponse : JSON.stringify(toolResponse);
    const driftSignals = [];

    // Check for TODO/FIXME that might indicate unimplemented spec items
    const todoMatches = responseText.match(/(?:TODO|FIXME|HACK|XXX)[\s:]+[^\n]+/gi) || [];
    if (todoMatches.length > 0) {
      driftSignals.push(`Found ${todoMatches.length} TODO/FIXME markers that may indicate unimplemented spec requirements`);
    }

    // Check for hardcoded values that might contradict spec
    const hardcodedPatterns = responseText.match(/(?:timeout|retries|max_|min_|limit|threshold)\s*[=:]\s*\d+/gi) || [];
    if (hardcodedPatterns.length > 0) {
      driftSignals.push(`Found ${hardcodedPatterns.length} hardcoded config value(s) — cross-reference against spec thresholds: ${hardcodedPatterns.slice(0, 3).join(', ')}`);
    }

    if (driftSignals.length > 0) {
      const output = JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: `DRIFT SIGNALS in ${filePath}:\n${driftSignals.map(s => `• ${s}`).join('\n')}\n\nCross-reference these against spec requirements.`
        }
      });
      process.stdout.write(output);
    }

    process.exit(0);
  } catch (e) {
    process.exit(0);
  }
});
