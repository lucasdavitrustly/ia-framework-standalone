# Feature Specification: Add Explorer Agent to Global Configuration

**Feature Branch**: `006-add-explorer-agent`

**Created**: 2026-06-03

**Status**: Draft

**Input**: User description: "Add agent explorer in the global configuration during the install.sh execution with a specific prompt for codebase exploration that overrides OpenCode's default explorer agent."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Explorer Agent Auto-Configured on Install (Priority: P1)

A developer runs install.sh to set up ia-framework. After installation completes, their OpenCode global configuration (opencode.json) includes an "explorer" agent definition with the specified prompt, permissions, and mode. When they use OpenCode, the explorer agent leverages ia-framework MCP tools for codebase exploration instead of the default behavior.

**Why this priority**: This is the core and only feature — without it, the explorer agent is not available after install.

**Independent Test**: Can be fully tested by running install.sh and verifying the resulting opencode.json contains the explorer agent with correct configuration.

**Acceptance Scenarios**:

1. **Given** a fresh install (no existing opencode.json), **When** the user runs install.sh, **Then** the generated opencode.json contains an "explorer" agent entry with the correct description, mode, permissions, and system prompt.
2. **Given** an existing opencode.json without an explorer agent, **When** the user runs install.sh, **Then** the explorer agent is added without modifying existing configuration entries.
3. **Given** an existing opencode.json that already has an explorer agent, **When** the user runs install.sh, **Then** the explorer agent configuration is updated to the latest version.

---

### User Story 2 - Explorer Agent Functional After Install (Priority: P2)

After install, when a developer invokes the explorer agent in OpenCode (e.g., via the Task tool with subagent*type "explorer"), it operates as a subagent with the specified permissions (allowing grep, glob, list, bash, webfetch, websearch, read, and ia-framework*\* tools while denying everything else).

**Why this priority**: Validates the agent actually works end-to-end, but depends on Story 1 being in place.

**Independent Test**: Can be tested by launching OpenCode after install and invoking the explorer agent to search for a file pattern, verifying it uses ia-framework tools and respects permission boundaries.

**Acceptance Scenarios**:

1. **Given** install.sh has completed successfully, **When** the user launches OpenCode and invokes the explorer agent, **Then** the agent responds using the configured prompt behavior and respects the defined permissions.

---

### Edge Cases

- What happens when opencode.json exists but is malformed/empty? The script should handle graceful JSON parsing failure and create a valid config.
- What happens when the opencode.json has no "agents" key? The script should create the "agents" section.
- What happens if Node.js is not available? The script should report an error and skip agent injection gracefully (consistent with existing MCP config behavior).

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The install.sh script MUST add an "explorer" agent definition to the OpenCode global configuration file (opencode.json) during execution.
- **FR-002**: The explorer agent configuration MUST include the exact description, mode (subagent), permissions, and system prompt as specified by the user.
- **FR-003**: The configuration MUST be merged with existing opencode.json content without overwriting unrelated settings (idempotent behavior).
- **FR-004**: If the explorer agent already exists in the config, the system MUST update it to the latest definition.
- **FR-005**: If opencode.json does not exist, the system MUST create it with both the MCP servers and the explorer agent.
- **FR-006**: The system MUST handle JSON parsing errors gracefully, consistent with existing error handling in configure-opencode.sh.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: After running install.sh, 100% of installations result in an opencode.json that includes a correctly configured explorer agent.
- **SC-002**: Existing opencode.json configurations retain all non-explorer settings after install (zero data loss on merge).
- **SC-003**: The explorer agent is functional in OpenCode immediately after restart (no manual configuration steps required).

## Assumptions

- The explorer agent configuration belongs in the same opencode.json file where MCP servers are configured (global OpenCode config).
- The configure-opencode.sh script is the appropriate place to add agent configuration logic, since it already manages opencode.json.
- OpenCode supports an "agents" key in opencode.json for defining custom agents (or equivalent configuration structure).
- The agent definition format follows OpenCode's expected schema for agent configuration.
