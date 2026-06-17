#!/usr/bin/env node
'use strict';

/**
 * tab-spec-formatter-output-guard.js
 * 
 * Stop hook: Verifies the output contains all required sections
 * before allowing the agent to finish.
 * 
 * Event: Stop
 * Exit: 0 = allow | 2 = block (incomplete output)
 */

const REQUIRED_SECTIONS = [
  'ISSUE:',
  'TITLE:',
  'PROBLEM:',
  'FUNCTIONAL_REQUIREMENTS:',
  'ACCEPTANCE_CRITERIA:',
  'CODEBASE_CONTEXT:',
  'TECHNICAL_RECOMMENDATION:'
];

let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const lastMessage = data.last_assistant_message || '';

    const missing = REQUIRED_SECTIONS.filter(s => !lastMessage.includes(s));

    if (missing.length > 0) {
      process.stderr.write(
        `Output incompleto. Seções faltando: ${missing.join(', ')}. ` +
        `Complete todas as seções obrigatórias do formato speckit.specify input.`
      );
      process.exit(2);
    }

    process.exit(0);
  } catch (e) {
    // If we can't parse, allow through
    process.exit(0);
  }
});
