# jira-feed

IDE-agnostic agent: JIRA ticket → a structured **seed** for the `specify` step of
**any** spec-driven-development framework (TLC, SpecKit, OpenSpec, ...).

Works with: **Claude Code** · **OpenCode** · **VS Code (Copilot)** · **Codex CLI**

## Install

Installed via the repo's installer (symlink-based, single source of truth):

```bash
./install.sh          # select "jira-feed" when prompted
```

Updates to `skills/jira-feed/` propagate immediately to all linked IDEs.

## Usage

| IDE | Command |
|-----|---------|
| Claude Code | `/jira-feed DEV-12345` |
| OpenCode | `/jira-feed DEV-12345` |
| VS Code | `#jira-feed` in Copilot Chat |
| Codex | `codex "jira-feed DEV-12345"` |

Optional `--target` selects the handoff destination (default `tlc`):

```
/jira-feed DEV-12345 --target=tlc        # → /tlc-specify "<seed>"
/jira-feed DEV-12345 --target=speckit    # → speckit.specify
/jira-feed DEV-12345 --target=openspec   # → OpenSpec specify
/jira-feed DEV-12345 --target=generic    # → neutral hint
```

`--target` only changes the handoff hint — the seed body is identical.

## Prerequisites

### MCP Servers

| Server | Purpose | Required |
|--------|---------|----------|
| **atlassian** | JIRA ticket data | ✅ Yes |
| **context7** | Library documentation | Recommended |
| **ia-framework** | Indexed codebase search | Optional |

## What it does

1. **Fetches** JIRA ticket data via the atlassian MCP
2. **Searches** the codebase for relevant context (ia-framework or grep/glob)
3. **Researches** documentation via Context7 for state-of-the-art patterns
4. **Asks** the owner clarifying questions (max 3, when the question tool is available)
5. **Outputs** a framework-neutral seed for the target `specify`
6. **Hands off**: offers to start the target `specify` (shows the exact command
   and stops — never auto-executes), to just emit the seed, or to grill the seed
   first via `grill-with-docs`. When grilling, the grill context is persisted to
   `.jira-feed/<ISSUE>-context.md` and appended to the seed.

## Output

The output (the "seed") is **plain structured text** (not markdown) designed as
input for a spec-driven framework's `specify` step. See
`templates/jira-feed-output-guide.md` for the format.

## License

MIT
