# AGENTS.md

## Project Purpose

This project provides an IDE-agnostic agent (`tab.format-spec`) that transforms
JIRA issues into structured text input for `speckit.specify`.

## Available Commands

- `/tab.format-spec <ISSUE-KEY>` — Fetches JIRA ticket, analyzes codebase, researches docs, generates speckit.specify input

## Example

```
/tab.format-spec DEV-12345
```

## Agent Behavior

When invoked with a JIRA issue key, the agent:

1. **Fetches** the JIRA ticket via MCP JIRA (required)
2. **Analyzes** the codebase via `ia-framework` MCP (or grep/glob fallback)
3. **Researches** documentation via `context7` MCP for state-of-the-art patterns
4. **Asks** the owner clarifying questions via question tool (max 3, when available)
5. **Generates** structured text input for `speckit.specify`

## Tool Priority

### Codebase Search
1. `mcp_ia-framework_search_codebase_hybrid` — hybrid BM25 + semantic
2. `mcp_ia-framework_search_codebase` — pure semantic
3. `mcp_ia-framework_get_file` — specific file retrieval
4. grep/glob/read — universal fallback

### Documentation
1. `mcp_context7_resolve-library-id` → `mcp_context7_query-docs`
2. Web search
3. Web fetch

### Owner Interaction
1. `question` tool (AskUserQuestion / vscode_askQuestions)
2. Document assumptions in output as fallback

## MCP Servers

- **jira** — Atlassian JIRA (REQUIRED)
- **context7** — Library documentation (recommended)
- **ia-framework** — Indexed codebase search (optional, graceful fallback)

## Rules

- Never implement code — only produce speckit.specify input
- Always cite sources
- When `ia-framework` is unavailable, fall back to native search
- Ask owner max 3 focused questions per invocation
- Output in the same language as the JIRA ticket
