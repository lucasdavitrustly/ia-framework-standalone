# Feature Specification: PostgreSQL db.json Bootstrap + MCP Descriptor Alignment + README Refresh

**Feature Branch**: `013-postgres-db-bootstrap`

**Created**: 2026-07-01

**Status**: Draft

**Input**: User description: "When, during the install.sh, when configuring the postgres connection we need to be able to write the db.json in the folder .ia-framework and if it no exist it should create. Also update the install.sh to use my current postgres and atlassian mcp connection, leave the strings as placeholder. Update the README.md with all current project usage, mcp, configurations and commands."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Configure PostgreSQL connection during install and persist db.json (Priority: P1)

A developer running `install.sh` selects the PostgreSQL MCP during the harness-configuration step. The installer prompts for the database connection details (host, port, database, user, password, SSL). The installer ensures the `.ia-framework` folder exists (creating it if absent) and writes a valid `db.json` file so the ia-framework `query_database` / `index_database_schema` tools can connect to the database.

**Why this priority**: This is the core request. Without db.json, the database-context tools cannot connect, and today the installer never writes it. Creating the folder when missing prevents a hard failure on a fresh checkout where `.ia-framework/` has not yet been created.

**Independent Test**: On a clean checkout with no `.ia-framework/` directory, run the installer, select the PostgreSQL MCP, enter connection details, and confirm that `.ia-framework/db.json` is created with the entered values in the correct shape and that the folder was created automatically.

**Acceptance Scenarios**:

1. **Given** the `.ia-framework` folder does not exist, **When** the user selects the PostgreSQL MCP and enters valid connection details, **Then** the installer creates the `.ia-framework` folder and writes `db.json` containing host, port, database, user, password, and ssl.
2. **Given** the `.ia-framework` folder already exists but `db.json` does not, **When** the user configures PostgreSQL, **Then** `db.json` is written without recreating or disturbing existing files in the folder.
3. **Given** `db.json` already exists, **When** the user re-runs the installer and selects PostgreSQL, **Then** the installer detects the existing file and prompts to keep or overwrite it (defaulting to keep), never silently discarding a valid configuration.
4. **Given** the user does NOT select the PostgreSQL MCP, **When** the installer runs, **Then** no `db.json` prompt appears and no `db.json` file is written.
5. **Given** the user enters invalid or empty required fields (e.g., empty database name), **When** the installer validates input, **Then** it re-prompts rather than writing an invalid `db.json`.

---

### User Story 2 - Install the actual PostgreSQL and Atlassian MCP connections with placeholder strings (Priority: P1)

A developer configuring MCPs expects the installer to offer the same PostgreSQL and Atlassian MCP integrations they already use day-to-day, so the generated IDE configuration matches a working setup. The connection strings and URLs committed to the repository are placeholders (never real credentials); real values are supplied interactively at install time and written only to local machine configuration.

**Why this priority**: The current descriptors are stale (wrong package for PostgreSQL, a Jira MCP that is not the one actually in use). Aligning them makes the installer produce a working configuration out of the box and removes a source of confusion. It is P1 because it directly changes what the installer writes into IDE config.

**Independent Test**: Run the installer, select the PostgreSQL and Atlassian MCPs, and confirm the resulting IDE configuration entries match the working command form (PostgreSQL via the correct package with a connection-string argument; Atlassian via the remote MCP endpoint), with placeholders substituted by the values provided at install time and no real credentials present in any committed file.

**Acceptance Scenarios**:

1. **Given** the PostgreSQL MCP is selected, **When** the installer writes the IDE configuration, **Then** the PostgreSQL MCP entry uses the same command form as the user's working setup and its connection string is built from the values collected for `db.json`.
2. **Given** the Atlassian MCP is offered instead of the old Jira MCP, **When** the user selects it, **Then** the installer writes an Atlassian MCP entry pointing at the remote Atlassian MCP endpoint.
3. **Given** any MCP descriptor or committed installer file, **When** it is inspected in version control, **Then** it contains only placeholder connection strings/URLs and no real credentials.
4. **Given** the old Jira MCP descriptor, **When** the change is applied, **Then** the Atlassian MCP replaces it so users are not offered a non-functional Jira integration.

---

### User Story 3 - README reflects current usage, MCPs, configuration, and commands (Priority: P2)

A new or returning developer reads `README.md` to understand how to install, configure, and use the framework. The README accurately documents the current install flow (including PostgreSQL db.json bootstrap), the full set of available MCPs (including PostgreSQL and Atlassian), all configuration options, and all CLI/MCP commands.

**Why this priority**: Documentation accuracy reduces onboarding friction and support load, but it does not block the runtime behavior delivered by Stories 1 and 2, so it is P2.

**Independent Test**: Read `README.md` end-to-end and verify that every documented install step, MCP, configuration key, and command matches the actual current behavior of the installer, descriptors, and CLI, with placeholder examples for any connection strings.

**Acceptance Scenarios**:

1. **Given** the updated installer behavior, **When** a reader follows the README install/setup sections, **Then** the described PostgreSQL/db.json flow and the folder-auto-create behavior match what the installer actually does.
2. **Given** the current set of MCPs, **When** a reader consults the MCP section, **Then** PostgreSQL and Atlassian are listed with placeholder connection examples and the stale Jira entry is removed or corrected.
3. **Given** the current CLI, **When** a reader consults the commands section, **Then** all listed commands and options match the actual CLI surface.

---

### Edge Cases

- What happens when the `.ia-framework` folder is missing at configuration time? → The installer must create it before writing `db.json`.
- What happens when `db.json` already exists and is valid? → Prompt keep/overwrite; default to keep; do not corrupt the existing file.
- What happens when the user provides a password containing special characters (e.g., `@`, `:`, `/`) that must appear in a connection string? → The connection string must be constructed so those characters are handled correctly and do not break the URL.
- What happens in non-interactive/CI runs where prompts cannot be answered? → The db.json bootstrap must not hang; it either skips PostgreSQL configuration or uses a documented non-interactive path.
- What happens when the user selects PostgreSQL but declines to enter details (empty input)? → Re-prompt for required fields; do not write an invalid file.
- What happens when SSL choice is left blank? → Default to a documented value (no SSL) rather than failing.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The installer MUST prompt for PostgreSQL connection details (host, port, database, user, password, SSL) when the user selects the PostgreSQL MCP during harness configuration.
- **FR-002**: The installer MUST create the `.ia-framework` folder if it does not already exist before writing `db.json`.
- **FR-003**: The installer MUST write `db.json` into the `.ia-framework` folder containing host, port, database, user, password, and ssl, in the shape accepted by the database-context configuration loader.
- **FR-004**: The installer MUST detect an existing `db.json` and prompt the user to keep or overwrite it, defaulting to keep, and MUST NOT silently discard a valid existing configuration.
- **FR-005**: The installer MUST validate required inputs (at minimum host, database, and user must be non-empty; port must be a valid port number) and re-prompt on invalid input rather than writing an invalid `db.json`.
- **FR-006**: The installer MUST NOT prompt for or write `db.json` when the PostgreSQL MCP is not selected.
- **FR-007**: The PostgreSQL MCP descriptor MUST match the user's working configuration form — the correct MCP package with the connection string supplied as a command argument — and MUST use a placeholder connection string in version control.
- **FR-008**: When the PostgreSQL MCP is installed into an IDE configuration, the installer MUST substitute the placeholder connection string with a connection string built from the values collected for `db.json`.
- **FR-009**: The framework MUST offer an Atlassian MCP that connects to the remote Atlassian MCP endpoint, replacing the previously offered Jira MCP.
- **FR-010**: All MCP descriptors and committed installer files MUST contain only placeholder connection strings/URLs and MUST NOT contain real credentials.
- **FR-011**: The PostgreSQL connection string built by the installer MUST correctly represent user, password, host, port, and database, including passwords that contain characters requiring escaping.
- **FR-012**: The installer's PostgreSQL configuration step MUST behave safely in non-interactive/CI runs (no indefinite hang), following the same non-interactive conventions as the rest of the installer.
- **FR-013**: The `README.md` MUST document the current install flow including the PostgreSQL db.json bootstrap and the automatic creation of the `.ia-framework` folder.
- **FR-014**: The `README.md` MUST document the full current set of MCPs, including PostgreSQL and Atlassian, with placeholder connection examples, and MUST NOT reference removed integrations as if they were current.
- **FR-015**: The `README.md` MUST document current configuration options and all current CLI and MCP commands so that documented behavior matches actual behavior.

### Key Entities _(include if feature involves data)_

- **db.json (database connection configuration)**: The persisted PostgreSQL connection used by the database-context tools. Attributes: host, port, database, user, password, ssl. Location: the `.ia-framework` folder within the framework directory.
- **PostgreSQL MCP descriptor**: The metadata describing how the PostgreSQL MCP is installed into IDE configurations, including its command form and a placeholder connection string.
- **Atlassian MCP descriptor**: The metadata describing how the Atlassian MCP is installed, pointing at the remote Atlassian MCP endpoint (placeholder URL in version control).
- **README.md**: The primary project documentation covering usage, MCPs, configuration, and commands.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: On a fresh checkout with no `.ia-framework` folder, a user selecting the PostgreSQL MCP and entering connection details ends the installer run with a valid `db.json` present in a newly created `.ia-framework` folder, with zero manual folder-creation steps required.
- **SC-002**: 100% of MCP descriptors and committed installer files contain no real credentials — only placeholders — verifiable by inspecting version control.
- **SC-003**: After install, the generated PostgreSQL and Atlassian MCP configuration entries match the user's working setup closely enough that the MCPs start successfully without manual edits.
- **SC-004**: A reader following the README install and MCP sections can reach a working configuration without encountering a documented step or command that does not match actual behavior (0 mismatches between README and current behavior for the covered sections).
- **SC-005**: Re-running the installer with an existing valid `db.json` never results in loss of that configuration without explicit user confirmation.

## Assumptions

- The db.json bootstrap is triggered by selecting the PostgreSQL MCP during the existing harness-configuration step (Step 5.1), per the confirmed decision, rather than as an always-on standalone step.
- The db.json shape is the existing `{ host, port, database, user, password, ssl }` structure validated by the current database-context configuration loader; no schema change is required.
- The PostgreSQL MCP uses the same package and command form as the user's current working setup (connection string passed as a command argument), and the Atlassian MCP uses the remote Atlassian MCP endpoint via the same remote-MCP launcher currently in use.
- Placeholder connection strings/URLs are the only connection values committed to the repository; real values live solely in local machine configuration produced at install time.
- The existing installer conventions for interactivity and non-interactive/CI detection are reused for the PostgreSQL configuration step.
- The README updates are scoped to reflecting current, already-decided behavior (usage, MCPs, configuration, commands); they do not introduce new product behavior beyond what Stories 1 and 2 deliver.
- Writing db.json may reuse the existing database configuration command that already produces db.json, extended to ensure the `.ia-framework` folder is created when missing, to keep a single source of truth for the file's shape.
