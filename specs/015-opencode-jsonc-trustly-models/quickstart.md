# Quickstart: OpenCode JSONC Config & Trustly LLM Models

**Branch**: `015-opencode-jsonc-trustly-models`

## What This Feature Does

Adds `opencode.jsonc` support to the ia-framework installer with pre-configured Trustly LLM gateway models (Amazon Bedrock). After running the installer, developers have immediate access to Claude Sonnet 4.6, Opus 4.8, and Haiku 4.5 via Trustly's gateway.

## Implementation Steps (High-Level)

### 1. Update IDE Descriptor (`scripts/ide-descriptors/opencode.sh`)

Change `IDE_MCP_CONFIG` and `IDE_DETECT_PATH` to reference `opencode.jsonc`:

```bash
IDE_DETECT_PATH="${XDG_CONFIG_HOME:-${HOME}/.config}/opencode/opencode.jsonc"
IDE_MCP_CONFIG="${IDE_GLOBAL_DIR}/opencode.jsonc"
```

### 2. Modify `install_mcp_opencode()` for Dual-Write (`scripts/configure-mcp.sh`)

After writing to `opencode.jsonc` (primary), also write to `opencode.json` (legacy). If `.jsonc` doesn't exist but `.json` does, seed `.jsonc` from `.json` content first.

### 3. Add `configure_trustly_provider()` (`scripts/install-opencode.sh`)

New function that:
1. Resolves the JSONC config path
2. Checks for existing Trustly-Claude provider (skip if present + interactive keep/overwrite)
3. Prompts for API token (skip in non-interactive mode → empty string)
4. Merges provider block into `opencode.jsonc`
5. Also merges into `opencode.json` (dual-write)

### 4. Add Step 5.3 to `install.sh`

```bash
# Step 5.3: Configure Trustly LLM provider
echo -e "${BOLD}Step 5.3: Trustly LLM Gateway${NC}"
configure_trustly_provider
```

### 5. Update `README.md`

Add a section documenting:
- The `opencode.jsonc` format
- Trustly Bedrock models (3 models)
- How to obtain/update the API token
- Manual configuration example

## Testing Strategy

1. **Fresh install** — Remove `~/.config/opencode/opencode.json*`, run `./install.sh`, verify `.jsonc` created with provider
2. **Upgrade install** — Create mock `.json` with MCPs, run installer, verify `.jsonc` contains both MCPs and provider
3. **Idempotency** — Run installer twice, verify no duplicate entries
4. **Non-interactive** — Run with `IA_NON_INTERACTIVE=1`, verify empty token written without prompt
5. **Existing provider** — Pre-create `.jsonc` with Trustly provider, verify not overwritten

## Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| `scripts/ide-descriptors/opencode.sh` | Modify | Update paths to `.jsonc` |
| `scripts/configure-mcp.sh` | Modify | Dual-write in `install_mcp_opencode()` |
| `scripts/install-opencode.sh` | Modify | Add `configure_trustly_provider()` |
| `install.sh` | Modify | Add Step 5.3 call |
| `README.md` | Modify | Add Trustly config documentation |

## Verification

```bash
# After running ./install.sh:
cat ~/.config/opencode/opencode.jsonc | python3 -m json.tool
# Should show: $schema, provider.Trustly-Claude, mcp entries

# Verify dual-write:
diff <(jq '.mcp' ~/.config/opencode/opencode.json) <(jq '.mcp' ~/.config/opencode/opencode.jsonc)
# Should show no differences in MCP entries
```
