# Quickstart: Install Script Resilience & Defaults

**Feature**: 003-install-resilience

## What This Feature Does

1. **Node Version Gate**: `install.sh` now checks that Node.js 22+ is the _active_ version before any build steps. If not, it displays a clear error, offers to install, and exits gracefully.

2. **MCP Log Visibility**: MCP server stderr is captured to `.ia-framework/logs/mcp-server.log`. A new dashboard page at `/logs` lets you view, filter, and refresh these logs.

3. **Correct Defaults**: The installer writes `project.json` with:
   - Multi-repo `repos` array format
   - `qwen3-embedding:0.6b` model with 1024 dimensions and document/query prefixes
   - `localhost` as the vector store host

## Development Setup

```bash
# Ensure you're on the feature branch
git checkout 003-install-resilience

# Install deps and build
pnpm install && pnpm build

# Run tests for affected packages
pnpm --filter @ia-framework/dashboard-api test
pnpm --filter @ia-framework/dashboard test
```

## Testing the Install Script Changes

```bash
# Test Node gate (simulate wrong version)
# Temporarily alias node to an older version, then run:
./install.sh
# Expected: clear error box, offer to install, exit 1

# Test config generation (fresh)
rm -f .ia-framework/project.json
./install.sh
# Inspect: .ia-framework/project.json should have repos[], prefixes, localhost

# Test config merge (existing config)
# With an existing project.json, re-run install.sh
# Expected: backup created, missing fields merged, existing values preserved
```

## Testing the Logs Dashboard

```bash
# Start services
docker compose up -d

# Generate some MCP logs (start OpenCode or manually write to log file)
echo '{"level":30,"time":1717401600000,"msg":"test log","name":"mcp-server"}' >> .ia-framework/logs/mcp-server.log

# Open dashboard
open http://localhost:3000/logs

# Test API directly
curl "http://localhost:3000/api/logs?level=info&limit=50"
```

## Key Files to Modify

| File                                        | Change                                          |
| ------------------------------------------- | ----------------------------------------------- |
| `scripts/check-prerequisites.sh`            | Enhanced Node gate with formatted error box     |
| `scripts/init-config.sh`                    | Multi-repo format, new defaults, merge logic    |
| `scripts/configure-opencode.sh`             | stderr redirect to log file                     |
| `install.sh`                                | Log dir creation, truncation, post-install hint |
| `packages/dashboard-api/src/routes/logs.ts` | NEW: logs API endpoint                          |
| `packages/dashboard-api/src/app.ts`         | Register logs route                             |
| `apps/dashboard/src/pages/LogsPage.tsx`     | NEW: logs viewer UI                             |
| `apps/dashboard/src/App.tsx`                | Add /logs route + nav                           |
