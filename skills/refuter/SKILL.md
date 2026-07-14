---
name: refuter
description: SDD-agnostic adversarial spec reviewer. The caller supplies which documents to validate; it spawns one focused analyst per document, adjudicates the findings, and produces REFUTATION.md plus one HTML report per role (default PM/DEV/QA). Cross-checks against the codebase (ia-framework MCP) and industry gold standards (Context7). Use to stress-test specs/plans/tasks/requirements for ambiguity, inconsistency, gaps, untestable claims, drift, and obsolescence before implementation. Triggers on "refute", "review the spec", "audit the spec", "find gaps/ambiguities in the spec", "red-team this spec", "spec quality gate".
---

# Refuter — Adversarial Spec Review

Finds ambiguities, inconsistencies, precision gaps, coverage gaps, testability
problems, spec↔code drift, and obsolescence in a caller-supplied set of
documents. It is agnostic to any spec-driven-development framework (TLC, SpecKit,
OpenSpec) or ad-hoc docs — **the document set is an input, never a hardcoded
assumption**.

## Activation

On IDEs with slash-command support (OpenCode, Claude Code) the primary entry
point is the `/refuter` command. On IDEs without slash commands (Cursor, Gemini,
Codex, VS Code Copilot) it activates by natural language — e.g. "refute the spec
in specs/018", "audit these requirements", "red-team this plan", "run a spec
quality gate on spec.md". Both paths spawn the same `refuter-orchestrator`.

## Command

| Command | What it does |
|---|---|
| `/refuter --docs=<glob\|csv>` | Refute an explicit set of documents |
| `/refuter --manifest=.refuter.json` | Use a preset (`docs` and/or `roles`) |
| `/refuter --spec-dir=PATH` | Scan the dir for `*.md` and confirm the set |
| `/refuter --report-roles=pm,dev,qa` | Choose report roles (default pm,dev,qa) |
| `/refuter --intensity=standard\|deep` | Analysis depth (default standard) |

Resolution order for the document set: `--docs` → `--manifest`/`.refuter.json`
→ scan `--spec-dir` and confirm with the owner via the question tool. Never
assume a fixed SpecKit six.

## How it works

1. **Discovery** — resolve the document set + report roles; write
   `.refuter/session.json` `{ docs, roles, specDir }` (hooks validate the run
   against this file).
2. **Delegation** — spawn one `refuter-analyst` per document (fresh context,
   templated prompt, no hardcoded filenames). Each analyst refutes its focus
   document against all the others and derives its finding-ID prefix from the
   focus filename.
3. **Adjudication** — the `refuter-orchestrator` verifies citations, checks
   cross-analyst consistency, and approves/rejects each finding.
4. **Gold-standard synthesis** — one consolidated Context7/web check on approved
   findings.
5. **Reports** — write `REFUTATION.md`, then spawn one `refuter-report-writer`
   per role → `REFUTATION-<ROLE>.html` (default PM/DEV/QA, unchanged behavior).

## Where it fits

`refuter` audits the **specification**; it complements — does not replace — the
implementation-level `validate` step of a workflow like TLC. A typical use is a
quality gate right after specify and before design/implementation:

```
/tlc-specify "…" → refuter --docs=.specs/features/NNN-slug/spec.md → /tlc-design …
```

Running it is always a suggestion, never an automatic phase transition.

## Analysis dimensions

- **AMB** — Ambiguity
- **INC** — Inconsistency
- **PRE** — Lack of Precision
- **GAP** — Gap (uncovered scenarios)
- **TST** — Testability
- **DRF** — Drift (spec↔code divergence)
- **OBS** — Obsolescence

## Requirements

- Optional: `ia-framework` MCP (codebase cross-reference; graceful fallback to grep/glob)
- Optional: `context7` MCP (gold-standard documentation)
