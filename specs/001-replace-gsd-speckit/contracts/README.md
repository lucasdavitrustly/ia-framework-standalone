# Contracts: Replace GSD with SpecKit

## CLI Installer Contract

The `scripts/install-speckit.sh` module exposes one public function to `install.sh`:

### `setup_speckit()`

**Behavior contract**:

| Condition                                     | Action                                  | Exit                |
| --------------------------------------------- | --------------------------------------- | ------------------- |
| Python 3.11+ found, uv found, specify found   | Print "✓ SpecKit ready"                 | Continue            |
| Python 3.11+ found, uv found, specify missing | Prompt to install specify               | Continue regardless |
| Python 3.11+ found, uv missing                | Prompt to install uv, then specify      | Continue regardless |
| Python < 3.11 or missing                      | Print warning + manual instructions     | Continue (skip)     |
| User declines any prompt                      | Print skip message + manual install cmd | Continue            |
| Any install command fails                     | Print error + manual install cmd        | Continue            |

**Invariant**: `setup_speckit` NEVER causes install.sh to exit with non-zero. All failures are warnings.

### User-Facing Messages

**Skip message** (when user declines or install fails):

```
⚠ Skipping SpecKit installation.
  The /speckit.* commands in OpenCode won't work until 'specify' is available.
  Install manually:
    uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@v0.9.0
```

**Success message**:

```
✓ SpecKit (specify v0.9.0) installed.
  The /speckit.* commands are now available in OpenCode for any project.
```

## No Other External Interfaces

This feature does not introduce APIs, MCP tools, or other machine-to-machine contracts.
