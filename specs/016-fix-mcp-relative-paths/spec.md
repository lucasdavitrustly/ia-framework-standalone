# Feature Specification: Fix MCP Node 26+ Compatibility

## Overview

The MCP server has two critical failures when running under newer runtime versions (Node.js 26+):

1. **Startup failure**: The server crashes during initialization because a native database dependency does not support Node 26, and the crash is unhandled in one code path.
2. **Path resolution failure**: File retrieval (chunk recovery) fails when the runtime environment's working directory does not match the project root — a condition more likely under newer runtimes where subprocess spawning behavior may differ.

The system must gracefully handle native dependency incompatibilities and resolve file paths deterministically using the configured repository paths rather than relying on the runtime's current working directory.

## Problem Statement

### Problem 1: Server Fails to Start on Node 26+

The MCP server depends on a native database addon for its dependency graph and metrics storage. This addon explicitly declares compatibility only with Node versions 20 through 25. When the server is launched under Node 26+:

- The native addon fails to load (no pre-built binaries exist for Node 26, and source compilation may fail due to API changes)
- The dependency graph initialization has error handling and degrades gracefully
- However, the metrics storage initialization has **no error handling** — its failure crashes the entire server process with no recovery

The runtime already provides a built-in SQLite module (available since version 22.5+) with an equivalent synchronous API. The system should use this built-in capability when available, eliminating the dependency on the native addon entirely for Node 22.5+ environments.

**Impact**: The MCP server is completely unusable on Node 26+. Developers who upgrade their runtime cannot use AI-assisted codebase tools until the native addon dependency is replaced with a runtime-native alternative.

### Problem 2: File Reads Fail Due to CWD-Dependent Path Resolution

When developers use the MCP tools (`get_file`, `search_codebase`) to retrieve code context, the system reads files from the filesystem by joining a resolved root path with a relative file path. The root path resolution depends on a chain that starts from the process's current working directory at startup. If this working directory is not the project root (which can happen when MCP hosts spawn the server as a subprocess, especially under newer runtime versions), the entire path resolution chain produces incorrect absolute paths, causing file reads to fail silently and fall back to stored content — which may be empty under the lean-payload indexing schema.

**Impact**: Developers receive empty or stale code context, degrading the quality of AI-assisted development without any clear error message indicating the root cause.

## Clarifications

### Session 2026-07-03

- Q: How should degraded-mode diagnostics be delivered to developers? → A: Per-response metadata — include a `warnings` or `degraded_features` field in each tool response when features are unavailable.
- Q: Should the system fully work on Node 26+ or just degrade gracefully? → A: Full functionality — use the runtime's built-in SQLite module (`node:sqlite` / `DatabaseSync`) as the primary backend on Node 22.5+, with the native addon as fallback for older versions.

## Actors

- **Developer**: Uses AI coding assistants that connect to the MCP server for codebase context
- **MCP Host**: The application (e.g., OpenCode, VS Code extension) that spawns the MCP server as a subprocess
- **MCP Server**: The ia-framework process that serves codebase context tools

## Functional Requirements

### FR-1: Full SQLite Functionality on All Supported Runtime Versions

The system must provide full SQLite-based functionality (dependency graph, metrics storage) on all supported runtime versions, including Node 26+, by using the runtime's built-in SQLite module when the third-party native addon is unavailable.

**Acceptance Criteria**:
- On Node 22.5+, the system uses the runtime's built-in SQLite module when the third-party native addon fails to load or is unavailable
- On older Node versions (22.0-22.4), the system uses the third-party native addon as before
- All features (dependency graph expansion, metrics collection) work identically regardless of which SQLite backend is active
- The SQLite backend selection is transparent to the rest of the codebase — consumers use the same interface regardless of backend
- If BOTH the built-in module and the native addon are unavailable (edge case), the server starts with those features disabled rather than crashing
- Each tool response includes a `warnings` or `degraded_features` metadata field listing any unavailable features that would normally enhance the response (e.g., dependency graph expansion disabled)

### FR-2: Runtime Version Compatibility Awareness

The system must detect and communicate runtime version information at startup, selecting the appropriate SQLite backend automatically.

**Acceptance Criteria**:
- At startup, the system detects the runtime version and determines which SQLite backend to use (built-in vs native addon)
- The selected backend is logged for diagnostic purposes
- If both backends are unavailable, a human-readable warning is logged stating which features are unavailable and how to resolve (upgrade runtime or install compatible native addon)
- The server does not refuse to start based solely on runtime version — it uses the best available backend and degrades only as a last resort

### FR-3: Deterministic Path Resolution

The system must resolve repository file paths to absolute filesystem locations without depending on the runtime's current working directory at the time of file read operations.

**Acceptance Criteria**:
- File reads succeed regardless of what directory the MCP server process was launched from
- Repository paths stored in configuration are always resolved to absolute paths at initialization time
- All filesystem operations use fully resolved absolute paths, never relative path joins that could be re-interpreted

### FR-4: Path Resolution Based on Repo Configuration

The system must use the registered repository configuration (path entries) as the authoritative source for resolving file locations, ensuring paths are anchored to the config file's own location.

**Acceptance Criteria**:
- Repository paths defined as relative in configuration are resolved relative to the configuration file's directory (not the current working directory)
- The resolved absolute path is validated (directory exists) at server startup
- If a configured repo path does not resolve to an existing directory, the server emits a clear diagnostic message identifying the misconfigured repo

### FR-5: Robust Filesystem Fallback Chain

When a file cannot be read from the primary path, the system must provide meaningful fallback behavior with clear diagnostics.

**Acceptance Criteria**:
- If filesystem read fails, the system attempts to serve stored chunk content from the index
- If stored content is empty (lean-payload schema), the response clearly communicates that the file could not be read and suggests potential causes (path misconfiguration, file moved/deleted)
- Error messages include the attempted absolute path and the configured repo root to aid debugging

### FR-6: Startup Path Validation

The system must validate that all configured repository paths resolve correctly at startup, before accepting tool requests.

**Acceptance Criteria**:
- At initialization, the system verifies each configured repo path resolves to an accessible directory
- If validation fails, a warning is logged with the specific path that failed and the base directory used for resolution
- The server still starts (to allow partial functionality) but marks affected repos as unavailable for filesystem reads

### FR-7: Consistent Behavior Across Runtime Versions

The path resolution must work identically regardless of the runtime version or how the server process was spawned.

**Acceptance Criteria**:
- File retrieval works when the server is launched with CWD set to the project root
- File retrieval works when the server is launched with CWD set to a different directory (e.g., the MCP host's own directory)
- File retrieval works when CWD changes during the server's lifetime (e.g., via OS-level directory operations)
- No runtime-version-specific behavior affects path resolution

## User Scenarios & Testing

### Scenario 1: Full Functionality on Node 26+

**Given** the MCP server is started on Node 26+ where the native addon is unavailable
**When** the system detects the runtime version and selects the built-in SQLite backend
**Then** the server starts with full functionality (dependency graph expansion AND metrics collection both active) using the built-in SQLite module

### Scenario 2: Server Startup with All Dependencies Available

**Given** the MCP server is started on a supported runtime version
**When** all native dependencies load successfully
**Then** the server starts with full functionality and no warnings

### Scenario 3: Normal File Retrieval (CWD = Project Root)

**Given** the MCP server is started from the project root directory
**When** a developer requests file content via `get_file`
**Then** the file is read successfully from the filesystem using the configured repo path

### Scenario 4: Mismatched CWD (Subprocess Spawn)

**Given** the MCP server is started as a subprocess by an MCP host with CWD set to the host's installation directory
**When** a developer requests file content via `get_file`
**Then** the file is still read successfully because paths are resolved from the config file location, not CWD

### Scenario 5: Multi-Repo Configuration

**Given** the project configuration defines multiple repositories with relative paths
**When** a developer requests files from different repos
**Then** each file is resolved correctly against its own repo's absolute base path

### Scenario 6: Invalid Repo Path at Startup

**Given** the project configuration contains a repo entry whose path does not exist on disk
**When** the MCP server initializes
**Then** a diagnostic warning is emitted naming the specific repo and path, and subsequent file requests for that repo return a clear error message

### Scenario 7: Lean-Payload Fallback

**Given** a file cannot be read from the filesystem (path resolution fails)
**And** the indexed content uses the lean-payload schema (no stored content)
**When** a developer requests file content via `get_file`
**Then** the response clearly indicates the file could not be loaded and provides diagnostic information (attempted path, configured root)

## Success Criteria

1. **Full functionality on Node 22.5+** — dependency graph expansion and metrics collection work on all runtime versions including Node 26+, using the built-in SQLite module as backend
2. **100% file retrieval success rate** when configured repo paths point to valid directories — regardless of CWD at server launch time
3. **Zero silent failures** — every failed file read or backend selection issue produces a diagnostic message visible to the developer
4. **Startup completes in under 2 seconds** for configurations with up to 10 repositories, including backend selection
5. **Backward compatibility maintained** — existing configurations and Node 22+ environments continue to work without modification
6. **No regression in retrieval latency** — file reads and graph queries complete within the same time bounds as before the fix (sub-100ms for typical operations)
7. **Transparent backend selection** — consumers of the SQLite layer cannot distinguish between the built-in and native addon backends at the API level

## Scope

### In Scope

- SQLite backend abstraction layer that selects between the runtime's built-in module and the third-party native addon
- Full functionality (dependency graph, metrics) on Node 26+ using the built-in SQLite module
- Runtime version compatibility detection and automatic backend selection
- Path resolution logic in the MCP server's file reading functions
- Startup validation of configured repository paths
- Error messaging for path resolution failures and degraded functionality
- Ensuring the config-file-relative resolution is applied consistently to all filesystem operations (read, stat)

### Out of Scope

- Upgrading the third-party native database addon itself to support Node 26 (the built-in module makes this unnecessary)
- Changes to the MCP protocol or tool interface
- Changes to the indexing pipeline or Qdrant storage
- MCP host configuration (how hosts spawn the server is their responsibility)
- Performance optimization of file reads beyond path resolution
- Changes to the project configuration file format (existing schema is sufficient)

## Assumptions

- The project configuration file (`.ia-framework/project.json`) location is always known or discoverable via environment variable at startup
- Repository paths in configuration are either absolute or relative to the configuration file's directory
- The MCP server runs with filesystem read permissions for all configured repo directories
- The lean-payload indexing schema (content stored externally, not in Qdrant) is the current standard for new indexes
- MCP hosts may spawn the server with any working directory — this is expected behavior, not a bug in the host
- The runtime's built-in SQLite module (available since Node 22.5) provides a synchronous API compatible with the project's needs (DatabaseSync with prepare/run/all)
- The built-in SQLite module's API surface is stable enough for production use on Node 22.5+ (it has been available for multiple major versions)
- The minimum supported runtime version remains Node 22.0.0 (some installations may still need the native addon as fallback for versions 22.0-22.4)

## Dependencies

- Project configuration file must be accessible at startup
- Filesystem access to configured repository directories
- Existing Qdrant index for fallback content (when available)
- Native database addon availability determines whether optional features (dependency graph, metrics) are active

## Key Entities

- **Repository Configuration**: The registered repos with their logical names and filesystem paths
- **Path Resolution Chain**: The sequence of operations that converts a relative file reference to an absolute filesystem path
- **Chunk**: An indexed code fragment that may or may not contain stored content, depending on the indexing schema
- **MCP Tool Request**: A request from the AI assistant for file content, containing a relative path and optional repo identifier
- **Native Dependency**: A compiled addon (e.g., the database engine) that may not be available on all runtime versions
- **Degraded Mode**: The server state where optional features are disabled due to dependency unavailability, but core functionality remains operational
