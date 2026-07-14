---
name: refuter
description: >
  SDD-agnostic adversarial spec review via orchestrated subagents. The CALLER
  supplies which documents to validate; the orchestrator spawns one focused
  analyst per document, then adjudicates findings for a precise final report.
  Each subagent refutes its document against all others with zero shared context.
argument-hint: "[--docs=glob|csv] [--spec-dir=path] [--manifest=.refuter.json] [--report-roles=pm,dev,qa] [--intensity=standard|deep]"
tools:
  read: true
  bash: true
  glob: true
  grep: true
  agent: true
  question: true
  write: true
  webfetch: true
  websearch: true
---

<objective>
Perform adversarial review of a caller-supplied set of documents using multi-agent
orchestration. This command is agnostic to any spec-driven-development framework
(TLC, SpecKit, OpenSpec, or ad-hoc docs) — the document set is an INPUT, never a
hardcoded assumption.

The orchestrator spawns one subagent per document. Each subagent refutes its assigned
document against all the others with fresh, focused context. The orchestrator then
adjudicates findings sequentially — approving or rejecting each — before producing
the final REFUTATION.md and one HTML report per requested role.

Arguments:
- `--docs=GLOB|CSV` (primary) — The documents to validate. Accepts a glob
  (e.g. `--docs="specs/018/*.md"`) or a comma-separated list
  (e.g. `--docs=spec.md,plan.md,tasks.md`). This is the SDD-agnostic core.
- `--manifest=PATH` (optional) — A JSON preset providing `docs` and/or `roles`
  so teams need not retype the set. Default lookup: `.refuter.json` at the
  repo root. Explicit `--docs`/`--report-roles` override the manifest.
- `--spec-dir=PATH` (optional) — Directory used to resolve relative docs and to
  write reports. Default: `specs/`.
- `--report-roles=CSV` (optional) — Roles to generate HTML reports for.
  Default: `pm,dev,qa` (reproduces the classic behavior exactly).
- `--intensity=LEVEL` (optional) — standard or deep. Default: standard.
  - standard: Dimensional analysis + gold standard + codebase cross-reference
  - deep: Adds cross-module interaction, hostile input probing, formal invariant checking

Resolution order for the document set:
1. `--docs` if provided.
2. else `--manifest` (or `.refuter.json`) `docs`.
3. else scan `--spec-dir` for `*.md` and CONFIRM the set with the owner via the
   question tool before proceeding. Never assume a fixed SpecKit six.
</objective>

<process>
## Execution Flow

This command spawns the `refuter-orchestrator` agent which:

1. **Discovery**: Resolve the document set (see resolution order above) and the
   report roles. Write `.refuter/session.json` = `{ docs:[...], roles:[...], specDir }`
   so completeness/drift hooks validate against THIS run, not hardcoded names.
2. **Delegation**: Spawn one `refuter-analyst` subagent per resolved document.
   Each analyst's REFERENCE_DOCUMENTS is "all the other documents in the set",
   computed dynamically. There is no fixed number of documents.
3. **Adjudication**: Reviews EVERY finding from all subagents:
   - Verifies citations are real
   - Checks cross-subagent consistency
   - Approves or rejects with reasoning
4. **Gold Standard Synthesis**: Consolidated external research on approved findings
5. **Final Report**: Generates REFUTATION.md with approved + rejected findings
6. **Role Reports**: Spawn one `refuter-report-writer` per role in
   `--report-roles` → `REFUTATION-<ROLE>.html`.

## Why This Architecture

- **Reduced entropy**: Each subagent has one focus = more precise analysis
- **Anti-hallucination**: Fresh context per document prevents context bleed
- **Cross-validation**: Same issue found from two sides = higher confidence
- **Adjudication layer**: Orchestrator filters noise, removes duplicates, verifies citations
- **SDD-agnostic**: The caller owns the document set and roles; the skill carries
  no framework-specific filenames.
</process>
