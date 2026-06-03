# Research: Fix MCP Stderr Configuration

## R1: OpenCode MCP Config Schema

**Decision**: Remove the invalid `stderr` field and use a shell wrapper command for stderr redirection.

**Rationale**: OpenCode's MCP config for local servers only supports these fields: `type`, `command`, `environment`, `enabled`, `timeout`. The `stderr` field is not recognized and causes a schema validation failure at startup. The `command` array is spawned directly, so shell redirection must be wrapped in `sh -c "..."`.

**Alternatives considered**:

- **Dedicated wrapper script file**: Creates an extra file to maintain; `sh -c` inline is simpler.
- **Modify MCP server binary to tee logs to file**: Invasive change; violates separation of concerns. The server should write to stderr, and the environment handles routing.
- **Remove logging entirely**: Breaks the dashboard log viewer feature from spec 003.

## R2: Correct Command Format

**Decision**: Change `command` from `["node", "<bin>"]` + invalid `stderr` field to `["sh", "-c", "node <bin> 2>> <logfile>"]`.

**Rationale**: OpenCode spawns the command array directly (not through a shell), so `["node", "bin.js"]` works but shell redirections don't. Wrapping in `sh -c` gives us shell features (redirection) while remaining a valid command array.

**Alternatives considered**:

- `["bash", "-c", "..."]`: Less portable than `sh`; no bash-specific features needed.
- Using `environment` with a log path + modifying the MCP server to read it: Too invasive for a bug fix.

## R3: Migration of Existing Broken Configs

**Decision**: When the script detects an existing `ia-framework` MCP entry with a `stderr` field, it removes the field and updates the `command` to use the shell wrapper format.

**Rationale**: Users who ran the broken install already have invalid configs. The script must be idempotent and self-healing.

**Alternatives considered**:

- Requiring manual cleanup: Poor UX; users may not know what's wrong.
- Deleting and recreating the entire MCP entry: Could lose user customizations to `environment` or `enabled`.

## R4: OpenCode Installation Methods

**Decision**: Use official methods from https://opencode.ai/download with platform-aware defaults.

**Available methods** (OpenCode Terminal category):

1. `curl -fsSL https://opencode.ai/install | bash` — Universal, no prerequisites
2. `npm i -g opencode-ai` — Requires Node.js/npm
3. `bun add -g opencode-ai` — Requires Bun
4. `brew install anomalyco/tap/opencode` — Requires Homebrew (macOS/Linux)
5. `paru -S opencode` — Requires paru (Arch Linux AUR)

**Platform defaults**:

- macOS: `brew` (if available), fallback to `curl`
- Linux: `curl` (universal default)
- Arch Linux: `paru` (if detected), fallback to `curl`

**Package name note**: The download page uses `opencode-ai` for npm/bun. The old script used `@opencode-sh/opencode` which is outdated. Use `opencode-ai` as per official page.

**Rationale**: Official install methods from opencode.ai/download are maintained by the OpenCode team. Curl is universally available; platform-specific package managers provide better system integration.

**Alternatives considered**:

- Keep `npm install -g @opencode-sh/opencode` (old package name, possibly deprecated)
- Always use curl (ignores user's preferred package manager)

## R5: Non-Interactive Mode Detection

**Decision**: Check `[ -t 0 ]` (stdin is a terminal) AND support `IA_NON_INTERACTIVE=1` env var.

**Implementation**: If `IA_NON_INTERACTIVE` is set or stdin is not a TTY, auto-select the platform default without prompting.

**Rationale**: Standard Unix practice. Environment variable allows explicit override in CI.

## R6: Package Manager Detection

**Decision**: Use `command -v <tool>` to detect availability before offering as option.

**Detection**:

- `command -v brew` → Homebrew
- `command -v npm` → npm
- `command -v bun` → Bun
- `command -v paru` → paru (Arch)
- `curl` → always assumed available

**Rationale**: Simple, portable, no false positives.
