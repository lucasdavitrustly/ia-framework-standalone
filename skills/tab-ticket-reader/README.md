# tab.format-spec

IDE-agnostic agent: JIRA ticket → structured input for **speckit.specify**.

Works with: **Claude Code** · **OpenCode** · **VS Code (Copilot)** · **Codex CLI**

## Install

```bash
# From the repo directory
node bin/tab-spec-formatter-install.js install

# Or via npx (after publishing)
npx @speckit/tab-format-spec install

# Or link globally for development
npm link
tab-spec-formatter install
```

## Usage

| IDE | Command |
|-----|---------|
| Claude Code | `/tab.format-spec DEV-12345` |
| OpenCode | `/tab.format-spec DEV-12345` |
| VS Code | `#tab.format-spec` in Copilot Chat |
| Codex | `codex "tab.format-spec DEV-12345"` |

## Manage

```bash
node bin/tab-spec-formatter-install.js status     # detect installations
node bin/tab-spec-formatter-install.js uninstall  # remove installed files
```

## Prerequisites

### MCP Servers

| Server | Purpose | Required |
|--------|---------|----------|
| **jira** | JIRA ticket data | ✅ Yes |
| **context7** | Library documentation | Recommended |
| **ia-framework** | Indexed codebase search | Optional |

### Environment Variables

```bash
JIRA_URL=https://your-org.atlassian.net
JIRA_API_TOKEN=your-token
JIRA_USER_EMAIL=your-email@company.com
```

## What it does

1. **Fetches** JIRA ticket data via MCP
2. **Searches** codebase for relevant context (ia-framework or grep/glob)
3. **Researches** documentation via Context7 for state-of-the-art patterns
4. **Asks** owner clarifying questions (max 3, when tool available)
5. **Outputs** structured text as input for `speckit.specify`

## Output

The output is **plain structured text** (not markdown) designed as input for `speckit.specify`. See `tab-spec-formatter-src/templates/tab-spec-formatter-output-guide.md` for the format.

## License

MIT
