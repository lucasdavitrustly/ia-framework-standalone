# Research: OpenCode JSONC Config & Trustly LLM Models

**Date**: 2026-07-03 | **Branch**: `015-opencode-jsonc-trustly-models`

## Research Tasks & Findings

### 1. Dual-Write Strategy for opencode.json / opencode.jsonc

**Decision**: Modify `install_mcp_opencode()` in `configure-mcp.sh` to write to both files. The JSONC file path is derived from the JSON path by appending `c` suffix.

**Rationale**: The existing `install_mcp_opencode()` function receives `$config_file` (the IDE_MCP_CONFIG path). The dual-write approach:
1. Write to the original `opencode.json` as before (backward compat)
2. Also write the same content to `opencode.jsonc` (forward compat)
3. If `opencode.jsonc` doesn't exist but `opencode.json` does, seed `.jsonc` with full `.json` content first (migration)

**Alternatives considered**:
- Separate IDE descriptor for `.jsonc` → Rejected: would cause double-prompting in IDE selection
- Replace `.json` entirely → Rejected: breaks older OpenCode versions
- Symlink `.jsonc` → `.json` → Rejected: some editors don't follow symlinks for syntax highlighting

### 2. Trustly Provider Configuration (Step 5.3)

**Decision**: Create a new function `configure_trustly_provider()` in `scripts/install-opencode.sh`. It:
1. Determines the JSONC config path (`~/.config/opencode/opencode.jsonc`)
2. Checks if `Trustly-Claude` provider already exists (idempotency)
3. Prompts for API token (or skips in non-interactive mode)
4. Merges the provider block into the JSONC file using inline Node.js (same pattern as `install_mcp_opencode`)

**Rationale**: Keeping it in `install-opencode.sh` is logical — it's OpenCode-specific configuration. Step 5.3 placement means MCPs are already written, so the JSONC file exists and we're only adding the provider section.

**Alternatives considered**:
- New script `scripts/configure-trustly.sh` → Rejected: over-engineering for a single function
- Embed in `configure-mcp.sh` → Rejected: provider config is separate concern from MCP registration

### 3. JSONC File Format Handling

**Decision**: Write standard JSON to the `.jsonc` file. JSONC is a strict superset of JSON, so valid JSON is valid JSONC. No comments needed in the generated file.

**Rationale**: 
- `JSON.parse()` can't parse JSONC (comments break it)
- Node.js inline scripts use `JSON.parse(readFileSync(...))` — this works with plain JSON content
- For reading existing `.jsonc` that may contain comments, use a strip-comments approach: `content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')` before parsing
- The `$schema` field provides editor support for autocompletion regardless of comments

**Alternatives considered**:
- Use a JSONC parser library → Rejected: adds dependency for installer scripts
- Add helpful comments to generated file → Deferred: can be added later, not blocking

### 4. IDE Descriptor Update Strategy

**Decision**: Update `IDE_MCP_CONFIG` in `scripts/ide-descriptors/opencode.sh` to point to `opencode.jsonc`. Also update `IDE_DETECT_PATH` to check for `.jsonc` first, falling back to `.json`.

**Rationale**: The detect path determines if OpenCode is "installed" (has config). Since newer versions use `.jsonc`, we detect both. The MCP config path determines where MCPs are written — since we dual-write, pointing to `.jsonc` as primary and handling `.json` as secondary inside `install_mcp_opencode()` works cleanly.

**Alternatives considered**:
- Keep descriptor pointing to `.json` and handle `.jsonc` only internally → Rejected: the descriptor should reflect the canonical config path for new installations

### 5. Migration Logic (opencode.json → opencode.jsonc)

**Decision**: In `install_mcp_opencode()` (and the new `configure_trustly_provider()`), before writing to `.jsonc`:
1. If `.jsonc` doesn't exist AND `.json` exists → copy full `.json` content as seed
2. If `.jsonc` exists → read it, merge new content (preserving existing)
3. If neither exists → create fresh `.jsonc` with `{}` base + `$schema`

**Rationale**: This ensures zero data loss (SC-003) and idempotency. The existing `opencode.json` is never deleted or modified beyond normal dual-write additions.

### 6. Malformed File Handling

**Decision**: If `.jsonc` exists but cannot be parsed (even after stripping comments), back it up as `opencode.jsonc.bak.<timestamp>` and create fresh. Log a warning.

**Rationale**: Silent corruption loss is worse than a backup. Timestamp prevents overwriting previous backups.

## Summary of Decisions

| Area | Decision | Impact |
|------|----------|--------|
| Dual-write | Write to both .json and .jsonc in `install_mcp_opencode()` | Medium — modifies core MCP install function |
| Trustly step | New `configure_trustly_provider()` in `install-opencode.sh`, called as Step 5.3 | Low — additive, no existing code modified |
| JSONC format | Write standard JSON; strip comments when reading existing | Low — simple implementation |
| IDE descriptor | Update `opencode.sh` paths to .jsonc (detect: both; write: .jsonc primary) | Low — single file change |
| Migration | Seed .jsonc from .json on first run if .json exists | Medium — must be correct to avoid data loss |
| Error handling | Backup corrupt files, warn, create fresh | Low — defensive programming |
