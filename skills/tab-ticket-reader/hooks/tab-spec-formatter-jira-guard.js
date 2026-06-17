#!/usr/bin/env node
'use strict';

/**
 * tab-spec-formatter-jira-required.js
 * 
 * PreToolUse hook: Logs JIRA MCP calls.
 * PostToolUse hook: Verifies JIRA data was fetched before proceeding.
 * 
 * Event: PostToolUse (matcher: mcp__jira__.*)
 * Exit: 0 = allow
 */

let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const toolName = data.tool_name || '';

    if (toolName.startsWith('mcp__jira__')) {
      const response = data.tool_response;
      if (response && typeof response === 'object' && response.error) {
        const ctx = `JIRA fetch falhou para a tool ${toolName}: ${response.error}. ` +
          `Verifique se o MCP JIRA está configurado corretamente (JIRA_URL, JIRA_API_TOKEN, JIRA_USER_EMAIL).`;
        const output = JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PostToolUse',
            additionalContext: ctx
          }
        });
        process.stdout.write(output);
      }
    }

    process.exit(0);
  } catch (e) {
    process.exit(0);
  }
});
