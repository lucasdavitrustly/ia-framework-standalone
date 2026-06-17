---
name: tab.refuter
description: >
  Adversarial spec review via orchestrated subagents. Spawns one focused analyst
  per document, then adjudicates findings for a precise final report.
  Each subagent refutes its document against all others with zero shared context.
argument-hint: "[--spec-dir=path] [--scope=all|spec|requirements|tests|plan] [--intensity=standard|deep]"
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
Perform adversarial review of project specifications using multi-agent orchestration.

The orchestrator spawns one subagent per document. Each subagent refutes its assigned
document against all others with fresh, focused context. The orchestrator then
adjudicates findings sequentially — approving or rejecting each — before producing
the final REFUTATION.md.

Arguments:
- `--spec-dir=PATH` (optional) — Path to specs directory. Default: `specs/`
- `--scope=SCOPE` (optional) — What to analyze: all|spec|requirements|tests|plan. Default: all
- `--intensity=LEVEL` (optional) — standard or deep. Default: standard
  - standard: Dimensional analysis + gold standard + codebase cross-reference
  - deep: Adds cross-module interaction, hostile input probing, formal invariant checking
</objective>

<process>
## Execution Flow

This command spawns the `tab-refuter-orchestrator` agent which:

1. **Discovery**: Locates spec directory, verifies 6 required docs exist
2. **Delegation**: Spawns `tab-refuter-analyst` subagent for EACH document sequentially:
   - spec.md analyst: refutes spec against requirements, plan, tasks, research, quickstart
   - requirements.md analyst: refutes requirements against spec, plan, tasks
   - plan.md analyst: refutes plan against spec, requirements, tasks
   - tasks.md analyst: refutes tasks against plan, spec, requirements
   - research.md analyst: refutes research against spec, requirements (checks currency)
   - quickstart.md analyst: refutes quickstart against spec, requirements, plan (checks accuracy)
3. **Adjudication**: Reviews EVERY finding from all subagents:
   - Verifies citations are real
   - Checks cross-subagent consistency
   - Approves or rejects with reasoning
4. **Gold Standard Synthesis**: Consolidated external research on approved findings
5. **Final Report**: Generates REFUTATION.md with approved + rejected findings

## Why This Architecture

- **Reduced entropy**: Each subagent has one focus = more precise analysis
- **Anti-hallucination**: Fresh context per document prevents context bleed
- **Cross-validation**: Same issue found from two sides = higher confidence
- **Adjudication layer**: Orchestrator filters noise, removes duplicates, verifies citations
</process>
