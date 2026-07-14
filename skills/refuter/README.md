# Refuter

SDD-agnostic adversarial spec reviewer that finds ambiguities, inconsistencies, and precision gaps in technical documentation. The **caller supplies which documents to validate** — it works with any spec-driven framework (TLC, SpecKit, OpenSpec) or ad-hoc docs. Confronts docs against industry gold standard via web research + Context7 MCP, and validates against the actual codebase via ia-framework MCP.

**IDE-agnostic**: OpenCode, Claude Code, Codex CLI, VS Code (Copilot).

## Install

Installed via the repo's installer (symlink-based, single source of truth):

```bash
./install.sh          # select "refuter" when prompted
```

Updates to `skills/refuter/` propagate immediately to all linked IDEs.

## Usage

```
/refuter --docs="specs/018/*.md"                       # explicit glob
/refuter --docs=spec.md,plan.md,tasks.md               # explicit list
/refuter --manifest=.refuter.json                      # preset (docs + roles)
/refuter --spec-dir=specs/018                          # scan + confirm the set
/refuter --docs=spec.md --report-roles=dev             # only the DEV report
```

Arguments:

- `--docs=GLOB|CSV` — the documents to validate (the SDD-agnostic core).
- `--manifest=PATH` — JSON preset with `docs` and/or `roles` (default lookup: `.refuter.json`).
- `--spec-dir=PATH` — dir to resolve relative docs / write reports (default `specs/`). When no `--docs`/manifest is given, the set is scanned here and **confirmed with you** before proceeding.
- `--report-roles=CSV` — roles to generate HTML reports for (default `pm,dev,qa` — unchanged classic behavior).
- `--intensity=standard|deep` — analysis depth (default `standard`).

## What It Does

1. Resolves the document set + roles and records the run in `.refuter/session.json`
2. Spawns one analyst per document (fresh context, no shared state)
3. Searches for gold-standard practices (Context7 MCP + web)
4. Cross-references docs against the actual codebase (ia-framework MCP)
5. Adjudicates all findings, then produces `REFUTATION.md` with grounded, cited findings
6. Generates one `REFUTATION-<ROLE>.html` per requested role (default PM/DEV/QA)

## Hooks (Enforcement Layer)

| Hook | Event | Purpose |
|------|-------|---------|
| Evidence Guard | Stop | Blocks output without literal citations + counter-references |
| Citation Verifier | Stop | Anti-hallucination — re-reads files to prove citations exist |
| Convergence Gate | Stop | Blocks if analysis coverage < threshold |
| Orchestration Complete | Stop | Validates the run against `.refuter/session.json` (docs + role reports) |
| Drift Detector | PostToolUse(Read) | Injects spec↔code divergences as context (spec docs read from session) |
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
