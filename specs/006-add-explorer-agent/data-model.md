# Data Model: Add Explorer Agent to Global Configuration

This feature does not involve persistent data entities or database models. It writes a static configuration file to the filesystem.

## Artifacts

### File: `~/.config/opencode/agents/explore.md`

| Attribute | Value                                                                                           |
| --------- | ----------------------------------------------------------------------------------------------- |
| Location  | `$XDG_CONFIG_HOME/opencode/agents/explore.md` (default: `~/.config/opencode/agents/explore.md`) |
| Format    | Markdown with YAML frontmatter                                                                  |
| Owner     | ia-framework install process                                                                    |
| Lifecycle | Created/overwritten on each install                                                             |

### Frontmatter Schema

| Field       | Type   | Required | Value                          |
| ----------- | ------ | -------- | ------------------------------ |
| description | string | yes      | Agent description for OpenCode |
| mode        | string | yes      | `subagent`                     |
| permission  | object | yes      | Tool permission map            |

### Permission Map

| Key              | Value | Meaning                          |
| ---------------- | ----- | -------------------------------- |
| `*`              | deny  | Deny all tools by default        |
| grep             | allow | Allow grep tool                  |
| glob             | allow | Allow glob tool                  |
| list             | allow | Allow list tool                  |
| bash             | allow | Allow bash tool                  |
| webfetch         | allow | Allow webfetch tool              |
| websearch        | allow | Allow websearch tool             |
| read             | allow | Allow read tool                  |
| ia-framework\_\* | allow | Allow all ia-framework MCP tools |

### Body Content

The markdown body contains the system prompt instructing the agent on its behavior as a codebase exploration specialist.
