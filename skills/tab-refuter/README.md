# TrustlyAB Refuter

Adversarial spec reviewer that finds ambiguities, inconsistencies, and precision gaps in technical documentation. Confronts project docs against industry gold standard via web research + Context7 MCP, and validates against actual codebase via ia-framework MCP.

**IDE-agnostic**: OpenCode, Claude Code, Codex CLI, VS Code (Copilot).

## Install

```bash
# Via npx (recommended)
npx @trustlyab/tab-refuter install

# Or install globally
npm install -g @trustlyab/tab-refuter
tab-refuter install
```

## Usage

### Interactive Installer

```bash
npx @trustlyab/tab-refuter install      # Install (global or local)
npx @trustlyab/tab-refuter uninstall    # Remove installation
npx @trustlyab/tab-refuter status       # Show installation status
```

The installer will:
1. Ask for scope (global user-level or local project)
2. Detect or ask for target IDE(s)
3. Copy agent, commands/skills, and hooks to the correct locations
4. Save a manifest for clean uninstallation

### After Installation

**OpenCode**: `/tab.refuter [--spec-dir=path] [--scope=all|spec|requirements|tests]`

**Claude Code**: `/tab.refuter` or let Claude auto-invoke when relevant

**Codex CLI**: `$tab.refuter` in prompt or ask Codex to use the TrustlyAB Refuter agent

**VS Code**: Ask Copilot to "use the TrustlyAB Refuter to review my specs"

## What It Does

1. Reads your spec documentation cold (zero prior context)
2. Searches for gold standard practices (Context7 MCP + web)
3. Cross-references specs against actual codebase (ia-framework MCP)
4. Produces `REFUTATION.md` with grounded, cited findings

## Hooks (Enforcement Layer)

| Hook | Event | Purpose |
|------|-------|---------|
| Evidence Guard | Stop | Blocks output without literal citations + counter-references |
| Citation Verifier | Stop | Anti-hallucination — re-reads files to prove citations exist |
| Convergence Gate | Stop | Blocks if analysis coverage < threshold |
| Drift Detector | PostToolUse(Read) | Injects spec↔code divergences as context |
| Audit Trail | PostToolUse(Write) | Complete audit trail of every action |
| Learning Append | PostToolUse(Write) | Accumulates antipatterns with budget-controlled curation |

## Analysis Dimensions

- **AMB** — Ambiguity
- **INC** — Inconsistency
- **PRE** — Lack of Precision
- **GAP** — Gap (uncovered scenarios)
- **TST** — Testability
- **DRF** — Drift (spec↔code divergence)
- **OBS** — Obsolescence

## Requirements

- Node.js >= 18
- One or more supported IDEs installed
- Optional: ia-framework MCP (for codebase validation)
- Optional: Context7 MCP (for gold standard documentation)

## License

MIT
