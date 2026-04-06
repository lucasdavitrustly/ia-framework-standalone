---
status: resolved
trigger: "Add the 'ia-framework' globally during the install and not start the indexing during the install phase. Add option to start it through the dashboard."
created: 2026-04-06T00:00:00Z
updated: 2026-04-06T00:10:00Z
---

## Current Focus

hypothesis: CONFIRMED — install.sh has Step 7 that runs indexing directly; the CLI package has a `bin` field but no global install step exists in install.sh; the dashboard's IndexingPanel with "Trigger Re-index" button exists but is NOT rendered in Overview or any page
test: Implement 3 changes: (1) remove Step 7 from install.sh + add global CLI install, (2) render IndexingPanel in Overview.tsx, (3) update install.sh success banner
expecting: install.sh completes without indexing; `ia-framework` is available as a global command; dashboard has "Start Indexing" button visible
next_action: RESOLVED — human verification confirmed all three items work correctly

## Symptoms

expected: The install.sh script should install "ia-framework" as a global CLI tool (so it's available system-wide), and it should NOT start the indexing process during installation. Instead, indexing should be triggerable from the dashboard.
actual: install.sh has a Step 7 that runs `node packages/cli/dist/bin.js index --config "$CONFIG_FILE"` which triggers full indexing during install. The CLI package has a `bin` field (`ia-framework: ./dist/bin.js`) but install.sh never runs `npm install -g` or `pnpm link`. The dashboard has an `IndexingPanel` component with a "Trigger Re-index" button but it's not rendered anywhere on the Overview page.
errors: None reported
reproduction: Run ./install.sh and observe behavior
started: Feature request / enhancement — may never have worked this way

## Eliminated

(none)

## Evidence

- timestamp: 2026-04-06T00:00:00Z
  checked: install.sh Step 7 (lines 229-243)
  found: Runs `node packages/cli/dist/bin.js index --config "$CONFIG_FILE"` directly during install, blocking until indexing completes
  implication: This is the indexing-during-install behavior that needs to be removed

- timestamp: 2026-04-06T00:00:00Z
  checked: packages/cli/package.json bin field
  found: `"bin": { "ia-framework": "./dist/bin.js" }` — the CLI has the correct bin definition, but install.sh never runs `pnpm link --global` or `npm install -g`
  implication: Need to add a global install step (pnpm link --global) after the build step

- timestamp: 2026-04-06T00:00:00Z
  checked: apps/dashboard/src/components/IndexingPanel.tsx
  found: IndexingPanel component with a "Trigger Re-index" button that calls `POST /api/indexing/trigger` — fully implemented
  implication: The component exists but is NOT rendered on the Overview page or anywhere else

- timestamp: 2026-04-06T00:00:00Z
  checked: apps/dashboard/src/pages/Overview.tsx
  found: Overview shows a simple indexing status indicator (lines 76-95) — just a dot/text, no trigger button. IndexingPanel is not imported or rendered.
  implication: Need to render IndexingPanel in Overview.tsx instead of (or alongside) the simple status indicator

- timestamp: 2026-04-06T00:00:00Z
  checked: packages/dashboard-api/src/routes/indexing.ts
  found: POST /api/indexing/trigger endpoint is fully implemented and works correctly
  implication: Backend already supports triggering indexing from dashboard

- timestamp: 2026-04-06T00:00:00Z
  checked: install.sh success banner (lines 252-260)
  found: Banner shows `node packages/cli/dist/bin.js index` as the re-index command (not global `ia-framework index`)
  implication: Need to update the success banner to use `ia-framework` global command after adding the global install step

## Resolution

root_cause: (1) install.sh Step 7 triggers indexing directly during install via `node packages/cli/dist/bin.js index`. (2) install.sh never ran `pnpm link --global` despite the CLI package having a `bin` field. (3) The existing IndexingPanel component with a trigger button existed but was not rendered anywhere — Overview.tsx showed only a static status dot.
fix: |

1. Removed Step 7 (initial indexing) from install.sh entirely.
2. Added Step 3.5 in install.sh: `pnpm link --global --dir "${SCRIPT_DIR}/packages/cli"` — makes `ia-framework` available system-wide after build.
3. Updated install.sh success banner to reference `ia-framework` global commands and point users to dashboard for starting indexing.
4. In Overview.tsx: replaced the simple static indexing status indicator with the full `IndexingPanel` component that has a "Start Indexing" button.
5. In IndexingPanel.tsx: renamed button label from "Trigger Re-index" to "Start Indexing" to match feature request language.
   verification: Human confirmed all three items work end-to-end — `ia-framework hello` works globally, `./install.sh` completes without indexing, dashboard Overview shows "Start Indexing" button.
   files_changed:

- install.sh
- apps/dashboard/src/pages/Overview.tsx
- apps/dashboard/src/components/IndexingPanel.tsx
