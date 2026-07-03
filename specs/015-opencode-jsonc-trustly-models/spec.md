# Feature Specification: OpenCode JSONC Config & Trustly LLM Models

**Feature Branch**: `015-opencode-jsonc-trustly-models`

**Created**: 2026-07-03

**Status**: Draft

**Input**: User description: "The new versions of opencode uses the opencode.jsonc. Please make the install also create/update the jsonc file to works with new versions. We also need to add Trustly LLMs gateway models provided by Amazon Bedrock, please use this as reference for the provider configuration. In the installation asks for user token if not provided, leave it blank and user can update it later. Add all this info in the readme.md."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Install with Trustly Models Auto-Configured (Priority: P1)

A developer runs `./install.sh` for the first time. After MCP configuration (Step 5.1) and skills installation (Step 5.2) complete, a new Step 5.3 prompts the user for their Trustly API token and creates/updates `~/.config/opencode/opencode.jsonc` with the Trustly LLM gateway provider configuration (Bedrock models). If the user provides a token, it's written into the config. If the user presses Enter without providing a token, an empty string is written as a placeholder that they can update later.

**Why this priority**: This is the core value delivery — ensuring that new installations are forward-compatible with the latest OpenCode config format and preconfigured with Trustly's gateway models.

**Independent Test**: Can be tested by running the installer and verifying that `~/.config/opencode/opencode.jsonc` is created with the correct provider structure and models listed.

**Acceptance Scenarios**:

1. **Given** a fresh system with no `opencode.jsonc`, **When** the user runs `./install.sh` and provides a Trustly API token, **Then** `~/.config/opencode/opencode.jsonc` is created with the Trustly-Claude provider section containing the user's token and all three Bedrock model entries.
2. **Given** a fresh system with no `opencode.jsonc`, **When** the user runs `./install.sh` and presses Enter without providing a token, **Then** `~/.config/opencode/opencode.jsonc` is created with the Trustly-Claude provider section containing an empty string for `apiKey` and all three Bedrock model entries.
3. **Given** an existing `opencode.jsonc` without Trustly provider, **When** the user runs `./install.sh`, **Then** the Trustly-Claude provider is added to the existing config without overwriting other existing settings.

---

### User Story 2 - Existing opencode.json Settings Migrated to JSONC (Priority: P2)

A developer who already has `opencode.json` configured (with MCP settings from a previous install) runs the installer again. The installer detects the existing `opencode.json`, creates `opencode.jsonc` incorporating the existing MCP configuration, and adds the Trustly provider. The legacy `opencode.json` is preserved (not deleted) to maintain backward compatibility.

**Why this priority**: Ensures existing users don't lose their configuration when upgrading, and provides a smooth migration path.

**Independent Test**: Can be tested by creating a mock `opencode.json` with MCP entries, running the installer, and verifying that `opencode.jsonc` contains both the migrated MCPs and the new Trustly provider.

**Acceptance Scenarios**:

1. **Given** an existing `opencode.json` with MCP entries, **When** the installer runs, **Then** `opencode.jsonc` is created/updated containing ALL existing `opencode.json` content (MCPs, permissions, providers, etc.) plus the Trustly-Claude provider.
2. **Given** an existing `opencode.json`, **When** the installer creates `opencode.jsonc`, **Then** the original `opencode.json` file is NOT deleted.

---

### User Story 3 - README Documents Trustly Configuration (Priority: P3)

A developer reads the project README to understand how to configure Trustly LLM models manually or to verify what the installer did. The README contains a dedicated section explaining the Trustly Bedrock models, how to obtain a token, and the `opencode.jsonc` configuration format.

**Why this priority**: Documentation ensures self-service setup and troubleshooting without needing to re-run the installer.

**Independent Test**: Can be tested by reading the README and following the manual configuration instructions to set up Trustly models without running the installer.

**Acceptance Scenarios**:

1. **Given** the project README, **When** a developer reads the OpenCode configuration section, **Then** they find clear instructions on configuring Trustly Bedrock models including the provider structure, available models, and where to obtain the API token.
2. **Given** the README documentation, **When** a developer follows the manual setup steps, **Then** they can configure `opencode.jsonc` with Trustly models without running the installer.

---

### Edge Cases

- What happens when the user's filesystem has no `~/.config/opencode/` directory? The installer must create it.
- How does the system handle a malformed or unparseable existing `opencode.jsonc`? The installer should back up the corrupt file and create a fresh one.
- What happens in non-interactive mode (CI/CD)? The Trustly token prompt should be skipped and an empty placeholder token written.
- What happens if `opencode.jsonc` already contains a `Trustly-Claude` provider entry? The installer should ask to keep or overwrite (default: keep).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The installer MUST create `~/.config/opencode/opencode.jsonc` if it does not exist.
- **FR-002**: The installer MUST add the Trustly-Claude provider configuration to `opencode.jsonc` with the following models: `bedrock-claude-sonnet-4-6`, `bedrock-claude-opus-4-8`, `bedrock-claude-haiku-4-5`.
- **FR-003**: The installer MUST prompt the user for their Trustly API token during interactive installation.
- **FR-004**: If the user does not provide a token (empty input), the installer MUST write an empty string as the `apiKey` value (not omit the field).
- **FR-005**: The installer MUST set the Trustly gateway base URL to `https://gateway.prd.devtools.trustly.cloud`.
- **FR-006**: The installer MUST preserve existing settings in `opencode.jsonc` when adding the Trustly provider (merge, not overwrite). When migrating from `opencode.json`, the ENTIRE file content (MCPs, permissions, providers, all settings) MUST be copied into `opencode.jsonc`.
- **FR-007**: The installer MUST write all MCP configurations to BOTH `opencode.json` and `opencode.jsonc` (dual-write), ensuring backward compatibility with older OpenCode versions while supporting the new format.
- **FR-008**: The IDE descriptor for OpenCode MUST be updated to reference `opencode.jsonc` as the config path.
- **FR-009**: The README MUST document the Trustly Bedrock models configuration, including: available models, the provider structure, the gateway URL, and instructions for obtaining/updating the API token.
- **FR-010**: In non-interactive mode, the installer MUST skip the token prompt and write an empty apiKey placeholder.
- **FR-011**: If an existing `opencode.jsonc` already contains a `Trustly-Claude` provider, the installer MUST prompt to keep or overwrite (default: keep). In non-interactive mode, keep existing.

### Key Entities

- **opencode.jsonc**: The new-format configuration file for OpenCode (JSONC = JSON with Comments), located at `~/.config/opencode/opencode.jsonc`. Contains provider definitions, MCP entries, permissions, and other OpenCode settings.
- **Trustly-Claude Provider**: A custom LLM provider configuration that routes requests through Trustly's Amazon Bedrock gateway, providing access to Claude models (Sonnet 4.6, Opus 4.8, Haiku 4.5).
- **API Token**: An authentication credential issued per developer for accessing the Trustly LLM gateway.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After running the installer, developers have a working `opencode.jsonc` file with Trustly models configured in under 30 seconds of additional install time.
- **SC-002**: 100% of new installations produce a valid `opencode.jsonc` that OpenCode (new versions) can parse without errors.
- **SC-003**: Existing `opencode.json` configurations are preserved — zero data loss during the migration/coexistence.
- **SC-004**: Developers can start using Trustly Bedrock models immediately after install (given a valid token) without any manual configuration steps.
- **SC-005**: The README provides sufficient documentation for a developer to manually configure Trustly models without running the installer.

## Assumptions

- OpenCode's newer versions read `opencode.jsonc` from `~/.config/opencode/opencode.jsonc` (same directory as the legacy `opencode.json`).
- Both `opencode.json` and `opencode.jsonc` can coexist; newer OpenCode versions prefer `.jsonc` when present.
- The Trustly LLM gateway URL (`https://gateway.prd.devtools.trustly.cloud`) is stable and used by all developers.
- Each developer has (or can obtain) their own Trustly API token.
- The JSONC format (JSON with Comments) is a strict superset of JSON — standard JSON is valid JSONC.
- The `$schema` field pointing to `https://opencode.ai/config.json` is included in the generated file for editor support.

## Clarifications

### Session 2026-07-03

- Q: Should MCPs be written to both opencode.json and opencode.jsonc, or only the new file? → A: Dual-write to both files for backward compatibility with older OpenCode versions.
- Q: What content should be migrated from opencode.json to opencode.jsonc? → A: Full migration — ALL content (MCPs, permissions, providers, etc.) copied into opencode.jsonc with Trustly provider added.
- Q: Where should the Trustly token prompt appear in the installer flow? → A: New Step 5.3, after MCP configuration (5.1) and skills installation (5.2) complete.
