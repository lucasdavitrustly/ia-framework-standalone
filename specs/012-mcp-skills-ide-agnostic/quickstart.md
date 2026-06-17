# Quickstart: IDE-Agnostic MCP & Skills Installation

**Feature**: `012-mcp-skills-ide-agnostic` | **Date**: 2026-06-17

Developer guide for implementing and manually testing this feature.

---

## Prerequisites

- Node.js ≥ 22
- pnpm ≥ 10
- Python3 ≥ 3.11
- macOS or Linux (zsh or bash)
- At least one supported IDE installed (OpenCode recommended for primary testing)

---

## Repository Setup

```bash
# Ensure you are on the feature branch
git checkout 012-mcp-skills-ide-agnostic   # or main if working directly

# Build the framework (required for ia-framework MCP binary)
pnpm install --frozen-lockfile
pnpm build
```

---

## Implementation Order

Work through tasks in this order to avoid blocked dependencies:

1. **Merge PR #59 content** — get `skills/` and `mcps/` placeholder dirs into the branch
2. **Normalize skill layouts** — flatten `tab-refuter-src/` and `tab-spec-formatter-src/` to `agents/`, `commands/`, `hooks/`, `templates/`
3. **Remove `skills/tab-spec-driven/`**
4. **Populate `tlc-spec-driven/`** — fetch from upstream, add `skill.json`
5. **Add `skill.json` to all 4 skills**
6. **Replace `mcps/*/tbd.txt` with real `mcp.json` descriptors** for all 5 MCPs
7. **Create `scripts/ide-descriptors/`** — 7 descriptor files
8. **Create `scripts/installer-helpers.sh`** — shared functions
9. **Create `scripts/configure-mcp.sh`**
10. **Create `scripts/install-skills.sh`**
11. **Create `scripts/fetch-skill.sh`**
12. **Create `scripts/uninstall.sh`**
13. **Update `install.sh`** — remove SpecKit, restructure Step 6

---

## Manual Testing

### Test 1: Clean install — OpenCode only

```bash
# Backup existing OpenCode config
cp ~/.config/opencode/opencode.json ~/.config/opencode/opencode.json.bak

# Run installer
./install.sh

# Expected prompts:
#   Step 6.1: Select IDEs → [1] OpenCode ← default
#   Step 6.1: Select MCPs → ia-framework [Y], context7 [Y], sequential-thinking [Y], jira [n], postgres [n]
#   Step 6.2: Select skills → Install all? [Y/n] → Y

# Verify MCPs in OpenCode config
cat ~/.config/opencode/opencode.json | python3 -m json.tool | grep -A3 '"mcp"'

# Verify skill symlinks
ls -la ~/.config/opencode/skills/
readlink ~/.config/opencode/skills/tlc-spec-driven

# Verify agent symlinks
ls -la ~/.config/opencode/agents/ | grep tab-refuter

# Verify command symlinks
ls -la ~/.config/opencode/command/ | grep tab

# Restore
cp ~/.config/opencode/opencode.json.bak ~/.config/opencode/opencode.json
```

### Test 2: Re-run — lifecycle prompts appear

```bash
# After Test 1, re-run
./install.sh

# Expected: Step 6.1 shows "context7 — already configured [skip/reinstall/uninstall]"
# Expected: Step 6.2 shows "tlc-spec-driven — linked [skip/re-link/unlink]"
```

### Test 3: Broken symlink detection

```bash
# Simulate a broken link by moving ia-framework temporarily
ORIG=$(pwd)
cd /tmp && mkdir ia-test && ln -sfn /tmp/ia-test/skills/tlc-spec-driven ~/.config/opencode/skills/tlc-spec-driven-test
rm -rf /tmp/ia-test

# Run installer — should detect broken link
./install.sh
# Expected: "⚠ tlc-spec-driven-test — broken link detected [re-link/unlink]"

# Cleanup
rm ~/.config/opencode/skills/tlc-spec-driven-test
cd "$ORIG"
```

### Test 4: CI / non-interactive mode

```bash
# Simulate CI environment
echo "" | ./install.sh
# OR
NON_INTERACTIVE=1 ./install.sh

# Expected: no prompts, OpenCode only, all default MCPs installed, all skills linked
```

### Test 5: Skill live-link update propagation

```bash
# Install tlc-spec-driven to OpenCode
./install.sh  # select OpenCode + tlc-spec-driven

# Verify current content
head -3 ~/.config/opencode/skills/tlc-spec-driven/SKILL.md

# Simulate an update in ia-framework
echo "# Updated" > skills/tlc-spec-driven/SKILL.md.test

# Check that the IDE sees it immediately (no reinstall)
ls ~/.config/opencode/skills/tlc-spec-driven/

# Cleanup test file
rm skills/tlc-spec-driven/SKILL.md.test
```

### Test 6: Uninstall

```bash
# Run full teardown
./scripts/uninstall.sh

# Confirm: prompts for confirmation, then removes all symlinks and MCP entries
# Verify
ls ~/.config/opencode/skills/
cat ~/.config/opencode/opencode.json | python3 -m json.tool | grep -A3 '"mcp"'
```

### Test 7: fetch-skill.sh

```bash
# Update tlc-spec-driven from upstream
./scripts/fetch-skill.sh tlc-spec-driven

# Verify version updated in skill.json
cat skills/tlc-spec-driven/skill.json | python3 -m json.tool | grep version

# Verify IDEs see update immediately (no reinstall needed)
ls ~/.config/opencode/skills/tlc-spec-driven/
```

### Test 8: MCP dependency warning

```bash
# Install tab-ticket-reader WITHOUT selecting jira MCP
./install.sh
# At Step 6.1: skip jira
# At Step 6.2: select tab-ticket-reader

# Expected: "⚠ tab-ticket-reader requires jira MCP which was not installed in this session."
# Expected: installation proceeds anyway
```

---

## Verifying Descriptor Extensibility

To verify SC-005 (adding a new IDE requires only a descriptor file):

```bash
# Create a minimal new IDE descriptor
cat > scripts/ide-descriptors/test-ide.sh << 'EOF'
IDE_ID="test-ide"
IDE_NAME="Test IDE"
IDE_DETECT_PATH="${HOME}/.test-ide/config.json"
IDE_GLOBAL_DIR="${HOME}/.test-ide"
IDE_SKILLS_DIR="${IDE_GLOBAL_DIR}/skills"
IDE_AGENTS_DIR="${IDE_GLOBAL_DIR}/agents"
IDE_COMMANDS_DIR=""
IDE_HOOKS_DIR=""
IDE_MCP_CONFIG="${IDE_GLOBAL_DIR}/config.json"
IDE_MCP_FORMAT="opencode-json"
IDE_AGENT_FORMAT="md"
IDE_SUPPORTS_SYMLINK="true"
IDE_SUPPORTS_HOOKS="false"
IDE_SUPPORTS_COMMANDS="false"
EOF

# Simulate IDE being "installed"
mkdir -p ~/.test-ide
echo '{}' > ~/.test-ide/config.json

# Run installer — Test IDE should appear in the list automatically
./install.sh

# Cleanup
rm -rf ~/.test-ide
rm scripts/ide-descriptors/test-ide.sh
```

---

## Debugging

**Check symlink state manually**:

```bash
path="$HOME/.config/opencode/skills/tlc-spec-driven"
if [ -L "$path" ] && [ -e "$path" ]; then echo "linked → $(readlink "$path")"
elif [ -L "$path" ]; then echo "BROKEN → $(readlink "$path")"
elif [ -d "$path" ]; then echo "copied (real dir)"
else echo "absent"
fi
```

**Check Claude Code hook registration**:

```bash
cat ~/.claude/settings.json | python3 -m json.tool | grep -A 20 '"hooks"'
```

**Check OpenCode MCP config**:

```bash
cat ~/.config/opencode/opencode.json | python3 -m json.tool | grep -A 5 '"mcp"'
```
