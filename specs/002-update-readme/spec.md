# Feature Specification: Update README

**Feature Branch**: `002-update-readme`

**Created**: 2026-06-02

**Status**: Draft

**Input**: User description: "Update the readme with CLI commands, project objective, stacks. So we have everything ready for new users and 'tutorial' how to use."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - New Developer Onboarding (Priority: P1)

A developer discovers ia-framework for the first time and needs to understand what it does, how to install it, and how to start using it within 10 minutes of reading the README.

**Why this priority**: The README is the first touchpoint for any new user. If it fails to clearly explain the value and getting-started path, users won't adopt the tool.

**Independent Test**: A developer unfamiliar with the project can follow the README from top to bottom and have a working ia-framework setup indexing their codebase.

**Acceptance Scenarios**:

1. **Given** a developer visits the repository, **When** they read the README, **Then** they understand the project objective (local RAG for AI coding assistants) within the first 30 seconds
2. **Given** a developer follows the Quick Start section, **When** they run `./install.sh`, **Then** they have a working setup including SpecKit CLI availability
3. **Given** a developer wants to know what tools are available, **When** they read the CLI Reference section, **Then** they find all current commands documented with examples

---

### User Story 2 - Technology Stack Clarity (Priority: P2)

A developer evaluating ia-framework wants to understand the technology choices, prerequisites, and architecture before committing to install it.

**Why this priority**: Understanding the stack helps developers assess compatibility with their environment and make informed adoption decisions.

**Independent Test**: A developer can identify all required and optional technologies, their versions, and why they were chosen.

**Acceptance Scenarios**:

1. **Given** a developer reads the Prerequisites section, **When** they check their system, **Then** they know exactly which tools they need (including SpecKit/specify CLI as optional)
2. **Given** a developer reads the Stack section, **When** they evaluate the project, **Then** they see the complete technology list with versions and purposes

---

### User Story 3 - Tutorial Workflow (Priority: P2)

A developer who has installed ia-framework wants a clear step-by-step tutorial showing the typical workflow from indexing through to using MCP tools in OpenCode.

**Why this priority**: Installation alone doesn't deliver value — users need to understand the workflow to get real benefit from the tool.

**Independent Test**: A developer can follow the tutorial workflow and successfully search their codebase via OpenCode.

**Acceptance Scenarios**:

1. **Given** a developer has completed installation, **When** they follow the tutorial section, **Then** they can index their project, verify it works, and connect to OpenCode
2. **Given** a developer wants to use SpecKit for spec-driven development, **When** they read the README, **Then** they understand SpecKit's role and available commands

---

### Edge Cases

- What happens when the README is read by someone without Node.js/Docker experience? The prerequisites section must link to installation guides.
- How does the README handle users who only want partial functionality (e.g., no Ollama, no dashboard)?

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: README MUST include the SpecKit CLI (`specify`) in the prerequisites table as an optional tool
- **FR-002**: README MUST document the SpecKit installation step added to `install.sh`
- **FR-003**: README MUST have an up-to-date technology stack section listing all major dependencies with versions
- **FR-004**: README MUST include all current CLI commands with usage examples
- **FR-005**: README MUST present a clear "Getting Started Tutorial" workflow that takes a new user from clone to first successful search
- **FR-006**: README MUST mention that `.opencode/` is per-user config (not tracked in git)
- **FR-007**: README MUST be structured with a logical progression: What → Why → Install → Tutorial → Reference → Troubleshoot

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A new developer can go from reading the README to a working ia-framework setup in under 15 minutes
- **SC-002**: All CLI commands currently available are documented in the README
- **SC-003**: The technology stack section lists 100% of production dependencies with their purpose
- **SC-004**: The README contains zero references to deprecated tools or workflows (e.g., no remaining GSD references)
- **SC-005**: New users understand the SpecKit integration and its purpose within 1 minute of reading the relevant section

## Assumptions

- Users have basic familiarity with command-line tools and git
- The primary audience is developers who use AI-assisted coding (specifically OpenCode)
- The README is the sole onboarding documentation (no separate wiki or docs site)
- Users have macOS or Linux (Windows/WSL is not officially supported)
- The existing README structure is mostly sound but needs SpecKit additions and minor reorganization
