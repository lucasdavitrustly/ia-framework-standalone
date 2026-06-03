# Research: Add Explorer Agent to Global Configuration

## Decision 1: Configuration Format

**Decision**: Use a markdown file at `~/.config/opencode/agents/explorer.md` rather than inline JSON in `opencode.json`.

**Rationale**:

- OpenCode supports agent definition via markdown files in `~/.config/opencode/agents/`
- The explorer agent has a long multi-line system prompt which is awkward in JSON
- Markdown files allow the file name to become the agent name (`explorer.md` → `explorer` agent)
- This avoids modifying the existing `opencode.json` merge logic in `configure-opencode.sh`
- The markdown format supports frontmatter for description, mode, and permissions, with the body as the system prompt

**Alternatives considered**:

- JSON in `opencode.json` under `"agent"` key: Would work but requires escaping the long prompt and complicates the JSON merge logic
- Separate JSON file: Not supported by OpenCode's agent loading mechanism

## Decision 2: Implementation Location

**Decision**: Add agent file creation logic to `scripts/configure-opencode.sh` within the existing `configure_opencode()` function.

**Rationale**:

- `configure-opencode.sh` already knows the OpenCode config directory path (`~/.config/opencode/`)
- It already creates directories and writes configuration files
- Keeping all OpenCode configuration in one script maintains cohesion
- The agent file write is a simple `cat > file` operation (no JSON merging needed)

**Alternatives considered**:

- New dedicated script: Unnecessary complexity for a single file write
- Inline in install.sh: Would break the existing separation of concerns

## Decision 3: Idempotency Behavior

**Decision**: Always overwrite the explorer.md file to ensure the latest prompt is deployed.

**Rationale**:

- The agent definition is owned by ia-framework, not user-customized
- Users who want custom modifications can create a differently-named agent
- This ensures updates to the prompt are always propagated on re-install
- Consistent with how MCP server config is updated (FR-004 from spec)

**Alternatives considered**:

- Skip if exists: Would prevent prompt updates from propagating
- Merge/diff: Unnecessary complexity for a file we fully own

## Decision 4: Agent Name Override

**Decision**: The agent is named `explorer` to override OpenCode's built-in `explore` subagent.

**Rationale**:

- The user specified "This agent will override the default explorer of opencode"
- OpenCode's built-in subagent is called `explore` (not `explorer`)
- Per the docs, the file name becomes the agent name
- We need to name the file `explore.md` to override the built-in `explore` agent

**Correction**: The file should be named `explore.md` (not `explorer.md`) to override the built-in explore subagent.
