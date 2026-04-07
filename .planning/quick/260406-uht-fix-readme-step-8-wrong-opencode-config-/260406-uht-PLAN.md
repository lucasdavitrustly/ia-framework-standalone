---
phase: quick
plan: 260406-uht
type: execute
wave: 1
depends_on: []
files_modified:
  - README.md
  - docs/opencode-setup.md
autonomous: true
requirements: []

must_haves:
  truths:
    - 'README.md Step 8 and all other OpenCode config references use opencode.json'
    - 'docs/opencode-setup.md uses opencode.json in all config file references'
  artifacts:
    - path: 'README.md'
      provides: 'Correct OpenCode config filename in Step 8 and related sections'
      contains: 'opencode.json'
    - path: 'docs/opencode-setup.md'
      provides: 'Correct OpenCode config filename throughout'
      contains: 'opencode.json'
  key_links:
    - from: 'README.md'
      to: 'opencode.json'
      via: 'config file path references'
      pattern: "opencode\\.json"
---

<objective>
Fix incorrect OpenCode config filename references in README.md and docs/opencode-setup.md.

Purpose: The correct filename is `opencode.json` (at `~/.config/opencode/opencode.json`), but the docs incorrectly reference `config.json`. This would cause users to create/edit the wrong file and MCP integration would silently fail.
Output: Both docs updated with correct filename; shell script already uses `opencode.json` and is untouched.
</objective>

<execution_context>
@~/.config/opencode/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md

The shell script `scripts/configure-opencode.sh` already correctly uses `opencode.json` (line 24: `local opencode_config="${opencode_config_dir}/opencode.json"`). Only the documentation files need fixing.

**Occurrences to fix:**

README.md (3 locations):

- Line 268: `~/.config/opencode/config.json` → `~/.config/opencode/opencode.json`
- Line 551: `~/.config/opencode/config.json` → `~/.config/opencode/opencode.json`
- Line 881: `~/.config/opencode/config.json` → `~/.config/opencode/opencode.json`

docs/opencode-setup.md (3 locations):

- Line 17: `~/.config/opencode/config.json` → `~/.config/opencode/opencode.json`
- Line 18: `$XDG_CONFIG_HOME/opencode/config.json` → `$XDG_CONFIG_HOME/opencode/opencode.json`
- Line 24: `Add the following to your \`config.json\``→`Add the following to your \`opencode.json\``
  </context>

<tasks>

<task type="auto">
  <name>Task 1: Fix config.json → opencode.json in README.md and docs/opencode-setup.md</name>
  <files>README.md, docs/opencode-setup.md</files>
  <action>
Make the following targeted replacements:

**README.md** — 3 occurrences:

1. Line 268: Replace `Add the MCP server to OpenCode's config at \`~/.config/opencode/config.json\``with`Add the MCP server to OpenCode's config at \`~/.config/opencode/opencode.json\``

2. Line 551: Replace `Add MCP servers to OpenCode's config at \`~/.config/opencode/config.json\`.`with`Add MCP servers to OpenCode's config at \`~/.config/opencode/opencode.json\`.`

3. Line 881: Replace `2. Check \`~/.config/opencode/config.json\` has the correct paths`with`2. Check \`~/.config/opencode/opencode.json\` has the correct paths`

**docs/opencode-setup.md** — 3 occurrences:

1. Line 17: Replace `- **macOS/Linux**: \`~/.config/opencode/config.json\``with`- **macOS/Linux**: \`~/.config/opencode/opencode.json\``

2. Line 18: Replace `- **Custom XDG**: \`$XDG_CONFIG_HOME/opencode/config.json\`` with `- **Custom XDG**: \`$XDG_CONFIG_HOME/opencode/opencode.json\``

3. Line 24: Replace `Add the following to your \`config.json\`:`with`Add the following to your \`opencode.json\`:`

Do NOT touch `scripts/configure-opencode.sh` — it already uses `opencode.json` correctly. Do NOT touch `.planning/` files.
</action>
<verify>
<automated>grep -n "config\.json" README.md docs/opencode-setup.md | grep -v "project.json\|tsconfig\|package\|ia-framework/config\|\.ia-framework" || echo "CLEAN — no stray config.json references found"</automated>
</verify>
<done>All OpenCode config path references in README.md and docs/opencode-setup.md use `opencode.json`. The grep above returns no lines (or only unrelated matches like tsconfig.json/project.json).</done>
</task>

</tasks>

<verification>
Run: `grep -n "opencode/config\.json\|opencode/opencode\.json" README.md docs/opencode-setup.md`

Expected: all 6 hits show `opencode.json`, none show `config.json`.
</verification>

<success_criteria>

- `~/.config/opencode/config.json` no longer appears in README.md or docs/opencode-setup.md
- `~/.config/opencode/opencode.json` appears in its place at all 3 README.md locations and all 3 docs/opencode-setup.md locations
- `scripts/configure-opencode.sh` is unchanged
  </success_criteria>

<output>
After completion, create `.planning/quick/260406-uht-fix-readme-step-8-wrong-opencode-config-/260406-uht-SUMMARY.md` with what was changed.
</output>
