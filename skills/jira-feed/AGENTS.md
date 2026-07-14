# AGENTS.md

## Project Purpose

This project provides an IDE-agnostic agent (`jira-feed`) that transforms JIRA
issues into a structured SEED, ready to hand off to the `specify` step of ANY
spec-driven-development framework (TLC, SpecKit, OpenSpec, ...). It is agnostic
to the SDD framework — `--target` only tunes the handoff hint, never the seed body.

## Available Commands

- `/jira-feed <ISSUE-KEY> [--target=tlc|speckit|openspec|generic]` — Fetches the
  JIRA ticket, analyzes the codebase, researches docs, generates the SEED, and
  hands off to the target framework's specify step. Default target: `tlc`.

## Example

```
/jira-feed DEV-12345
/jira-feed DEV-12345 --target=speckit
```

## Agent Behavior

When invoked with a JIRA issue key, the agent:

1. **Fetches** the JIRA ticket via MCP atlassian (required)
2. **Analyzes** the codebase via `ia-framework` MCP (or grep/glob fallback)
3. **Researches** documentation via `context7` MCP for state-of-the-art patterns
4. **Asks** the owner clarifying questions via question tool (max 3, when available)
5. **Generates** the structured SEED (framework-neutral)
6. **Hands off** to specify: offers to start the target `specify` (showing the
   exact command and stopping — never auto-executing), to just emit the seed, or
   to grill the seed first via `grill-with-docs`. When grilling, the grill's
   context block is captured, persisted to `.jira-feed/<ISSUE-KEY>-context.md`,
   and appended to the seed passed to specify.

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

- **atlassian** — Atlassian JIRA (REQUIRED)
- **context7** — Library documentation (recommended)
- **ia-framework** — Indexed codebase search (optional, graceful fallback)

## Rules

- Never implement code — only produce the specify SEED
- Never auto-run specify — show the command and let the user authorize it
- Always cite sources
- When `ia-framework` is unavailable, fall back to native search
- Ask owner max 3 focused questions per invocation (shared between clarification
  and handoff)
- Output in the same language as the JIRA ticket
- The seed body is identical regardless of `--target`; only the handoff hint changes
