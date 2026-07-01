# Quickstart: PostgreSQL db.json Bootstrap + MCP Descriptor Alignment

**Feature**: `013-postgres-db-bootstrap`

This quickstart validates the delivered behavior. Placeholders (`PLACEHOLDER_*`)
stand in for your real values — never commit real credentials.

## 1. Fresh install writes db.json and creates the folder

```bash
# From a checkout where .ia-framework/ may not exist yet
./install.sh
# Step 5: Harness Configuration → Step 5.1: Configure MCPs
#   • Select an IDE (e.g. OpenCode)
#   • In the MCP list, toggle "PostgreSQL"
#   • When prompted, enter connection details:
#       Host [localhost]: PLACEHOLDER_HOST
#       Port [5432]: 5432
#       Database name: PLACEHOLDER_DB
#       User: PLACEHOLDER_USER
#       Password: PLACEHOLDER_PASSWORD
#       Use SSL? [y/N]: N
```

**Expected**:

- `.ia-framework/` is created automatically if it was missing.
- `.ia-framework/db.json` exists and matches the db-json schema:

```bash
cat .ia-framework/db.json
# { "host": "...", "port": 5432, "database": "...", "user": "...", "password": "...", "ssl": false }

ia-framework db status
# Database: configured
# Config: PLACEHOLDER_HOST:5432/PLACEHOLDER_DB (user: PLACEHOLDER_USER)
```

## 2. PostgreSQL MCP entry is written with a real DSN (from placeholder token)

```bash
# Inspect the IDE MCP config the installer wrote (OpenCode example)
node -e "const c=require(require('os').homedir()+'/.config/opencode/opencode.json');console.log(JSON.stringify(c.mcp.postgres,null,2))"
```

**Expected**: `command` ends with `postgresql://PLACEHOLDER_USER:PLACEHOLDER_PASSWORD@PLACEHOLDER_HOST:5432/PLACEHOLDER_DB`, and the committed `mcps/postgres-mcp/mcp.json` still contains `{{POSTGRES_CONNECTION_STRING}}`.

## 3. Idempotent re-run keeps existing db.json

```bash
./install.sh   # select PostgreSQL again
#   → "db.json already exists — overwrite? [y/N]:"  → press Enter (No)
```

**Expected**: existing `db.json` unchanged (SC-005).

## 4. Atlassian MCP replaces Jira

```bash
ls mcps/            # atlassian-mcp present, jira-mcp absent
./install.sh        # MCP list offers "Atlassian" (not "Jira")
```

**Expected**: selecting Atlassian writes an entry running `mcp-remote@latest https://mcp.atlassian.com/v1/mcp/authv2`.

## 5. Non-interactive / CI does not hang

```bash
CI=1 ./install.sh   # or run with stdin not a TTY
```

**Expected**: PostgreSQL prompt path is skipped or uses defaults; the run completes without blocking (FR-012).

## 6. Docs match behavior

```bash
grep -n "db.json\|atlassian\|@modelcontextprotocol/server-postgres" README.md
```

**Expected**: README documents the db.json bootstrap + folder auto-create, lists PostgreSQL and Atlassian MCPs with placeholder DSN examples, and no longer presents Jira as current (FR-013/014/015, SC-004).

## Test gates

```bash
pnpm --filter @ia-framework/cli test    # includes new failing-first db configure mkdir test
pnpm build                              # must stay green (fixes pre-existing db.command.ts:160 error)
```
