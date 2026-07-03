# Data Model: OpenCode JSONC Config & Trustly LLM Models

**Date**: 2026-07-03 | **Branch**: `015-opencode-jsonc-trustly-models`

## Entities

### 1. OpenCode Configuration File (`opencode.jsonc`)

**Purpose**: Primary configuration file for newer OpenCode versions. Contains LLM providers, MCP server definitions, permissions, and plugins.

**Location**: `~/.config/opencode/opencode.jsonc`

**Schema**: `https://opencode.ai/config.json`

**Structure**:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "<provider-name>": {
      "options": {
        "baseURL": "<gateway-url>",
        "apiKey": "<token>"
      },
      "models": {
        "<model-id>": {
          "name": "<display-name>"
        }
      }
    }
  },
  "mcp": {
    "<mcp-id>": {
      "type": "local",
      "command": ["<cmd>", "<args...>"],
      "environment": { "<KEY>": "<VALUE>" },
      "enabled": true
    }
  },
  "permission": { /* ... */ },
  "plugin": { /* ... */ }
}
```

### 2. Trustly-Claude Provider

**Purpose**: LLM provider configuration that routes Claude model requests through Trustly's Amazon Bedrock gateway.

**Attributes**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `options.baseURL` | string | Yes | Always `https://gateway.prd.devtools.trustly.cloud` |
| `options.apiKey` | string | Yes | Developer's personal API token (may be empty string) |
| `models` | object | Yes | Map of model-id → display config |

**Models** (fixed set):

| Model ID | Display Name |
|----------|-------------|
| `bedrock-claude-sonnet-4-6` | Claude Sonnet 4.6 (Trustly Bedrock) |
| `bedrock-claude-opus-4-8` | Claude Opus 4.8 (Trustly Bedrock) |
| `bedrock-claude-haiku-4-5` | Claude Haiku 4.5 (Trustly Bedrock) |

### 3. Legacy Configuration File (`opencode.json`)

**Purpose**: Configuration file for older OpenCode versions. Maintained via dual-write for backward compatibility.

**Location**: `~/.config/opencode/opencode.json`

**Relationship to `opencode.jsonc`**: Both files contain identical MCP entries and provider configurations. The `.jsonc` version is the canonical source for newer OpenCode; the `.json` version is maintained for backward compatibility.

## State Transitions

### Configuration File Lifecycle

```
[No Config]
    │
    ├─ Fresh install (no .json, no .jsonc)
    │   └─→ [.jsonc created with $schema + Trustly provider]
    │       └─→ [.json created via dual-write with MCPs]
    │
    ├─ Upgrade install (.json exists, no .jsonc)
    │   └─→ [.jsonc seeded from .json content]
    │       └─→ [Trustly provider merged into .jsonc]
    │           └─→ [Both files maintained via dual-write]
    │
    └─ Re-run install (.jsonc already exists)
        ├─ Trustly provider absent → [Provider added]
        └─ Trustly provider present → [Keep existing, no overwrite]
```

### Token State

| State | apiKey value | Behavior |
|-------|-------------|----------|
| Token provided | `"sk-abc123..."` | OpenCode can authenticate with Trustly gateway |
| Token empty | `""` | OpenCode shows auth error; user updates token later |
| Token placeholder (non-interactive) | `""` | Same as empty — requires manual update |

## Validation Rules

- `opencode.jsonc` MUST be valid JSON (since JSONC is a superset, valid JSON is always valid JSONC)
- `options.baseURL` MUST be exactly `https://gateway.prd.devtools.trustly.cloud`
- `options.apiKey` MUST be a string (empty string is valid)
- Provider key MUST be `Trustly-Claude` (exact casing)
- Model IDs MUST match exactly: `bedrock-claude-sonnet-4-6`, `bedrock-claude-opus-4-8`, `bedrock-claude-haiku-4-5`
- Existing non-Trustly providers in the file MUST NOT be modified or removed

## Relationships

```
opencode.jsonc (1) ──contains──► (0..N) Provider
opencode.jsonc (1) ──contains──► (0..N) MCP Server
opencode.json  (1) ──mirrors───► (1) opencode.jsonc [MCP entries only via dual-write]
Provider       (1) ──has──────► (1..N) Model
```
