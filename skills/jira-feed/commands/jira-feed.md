---
name: jira-feed
description: >
  Turns a JIRA ticket into a structured SEED, ready to feed the "specify" step of
  ANY spec-driven-development framework (TLC, SpecKit, OpenSpec, ...). Fetches the
  ticket via the atlassian MCP, analyzes the codebase via ia-framework, researches
  docs via Context7, and hands off to specify.
argument-hint: "<ISSUE-KEY> [--target=tlc|speckit|openspec|generic]"
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
Turn a JIRA ticket into structured text (the "SEED") that serves as INPUT to the
`specify` step of a spec-driven-development framework.

The output is NOT the final spec — it is the formatted technical summary that
feeds specify. This command is framework-AGNOSTIC: `--target` only tunes the
handoff hint, never the seed body.

Arguments:
- `$ARGUMENTS` (required) = JIRA issue key (e.g. DEV-12345)
- `--target=tlc|speckit|openspec|generic` (optional) — the handoff destination
  framework. **Default: `tlc`**. Adjusts only the suggested handoff command:
  - `tlc` → `/tlc-specify "<seed>"`
  - `speckit` → `speckit.specify` with the seed
  - `openspec` → OpenSpec's specify flow with the seed
  - `generic` → neutral instruction ("use this seed as input to your specify")
</objective>

<process>
## Execution Flow

### 1. Fetch the JIRA data

Use the atlassian MCP to fetch the ticket `$ARGUMENTS`. Extract:
- Summary (title)
- Description (full text)
- Acceptance Criteria
- Labels, Components, Fix Version
- Epic Link, Linked Issues
- Priority, Story Points
- Relevant team comments

If the atlassian/JIRA MCP is unavailable, inform the user and stop.

### 2. Analyze the codebase

Tool priority:
1. `mcp_ia-framework_search_codebase_hybrid` — hybrid BM25 + semantic search
2. `mcp_ia-framework_search_codebase` — pure semantic
3. `mcp_ia-framework_get_file` — specific file
4. native grep/glob/read — universal fallback

Look for:
- Modules/files related to the ticket's domain
- Existing implementation patterns (how similar problems were solved)
- Relevant dependencies and integrations

### 3. Deep Research (State of the Art)

Use the Context7 MCP:
1. `resolve-library-id` → identify libs/frameworks mentioned in the ticket
2. `query-docs` → current best practices and patterns

Complement with web search for:
- Applicable architectural patterns
- Relevant standards and RFCs

### 4. Clarify with the Owner (if needed)

If there are CRITICAL ambiguities that block generating the input:
- Use the `question` tool (max 3 focused questions — this budget is SHARED with
  the handoff question in step 6)
- If unavailable, document the ambiguities in the output

### 5. Generate the Output (the SEED)

Generate the SEED following EXACTLY the format in `<output-format>`. This text is
the input to the `specify` step — it is not the final spec.

### 6. Handoff (SDD-agnostic)

After generating the SEED, perform the handoff. Behavior:

**If the `question` tool is available AND there is remaining question budget**
(max 3 total, counting step 4), ask how to proceed:

- **Start specify now** — build the target command per `--target`
  (default `tlc` → `/tlc-specify "<SEED>"`), SHOW the exact command with the SEED
  ready, and **STOP**. Do NOT run specify yourself: the slash-command is the
  user's authorization (this respects TLC's phase-transition gate).
- **Emit the seed only** — print the SEED and stop; the user starts later.
- **Grill first (grill-with-docs)** — if the `grill-with-docs` skill is
  available, invoke it on the SEED. Capture the context block it produces.
  Persist it to `.jira-feed/<ISSUE-KEY>-context.md` (create the directory if
  needed) and build:
  `ARGUMENTS = SEED + "\n\n## Additional context (grill)\n" + CONTEXT_BLOCK`.
  Then offer to start specify with that `ARGUMENTS` (same rule as
  "Start now": show the command and stop).

**If the `question` tool is NOT available OR the question budget is exhausted:**
print the SEED followed by a suggested handoff line per `--target`
(e.g. `To specify: run /tlc-specify with the text above`) and **STOP**.

**Safe default:** when in doubt, do NOT advance — emit the seed and stop.
Advancing to specify is always an explicit user opt-in.
</process>

<output-format>
## Output Format

```
ISSUE: {ISSUE-KEY}
TITLE: {ticket title}
PRIORITY: {P0-P4}
EPIC: {epic link or "N/A"}
COMPONENTS: {comma-separated list}
LABELS: {comma-separated list}
FIX_VERSION: {target version}

---

PROBLEM:
{Objective description of the problem to solve, synthesized from JIRA + codebase context}

IMPACT:
{Who is affected, what is the impact of not solving it}

---

FUNCTIONAL_REQUIREMENTS:
- {FR-01}: {requirement derived from the ticket}
- {FR-02}: {requirement derived from the ticket}

NON_FUNCTIONAL_REQUIREMENTS:
- {NFR-01} [Performance]: {measurable criterion}
- {NFR-02} [Security]: {criterion}
- {NFR-03} [Observability]: {criterion}

---

ACCEPTANCE_CRITERIA:
- AC-01: Given {precondition}, When {action}, Then {result}
- AC-02: Given {precondition}, When {action}, Then {result}

---

CODEBASE_CONTEXT:
- {path/to/file.ts}: {relevance — what it does, why it matters}
- {path/to/module/}: {relevance}

EXISTING_PATTERNS:
- {Pattern identified in the code that can be reused}

DEPENDENCIES:
- {Existing dependency}: {how it will be used}
- {Suggested new dependency}: {justification based on research}

---

TECHNICAL_RECOMMENDATION:
{Recommended approach based on Context7 research + codebase analysis.
 Include: suggested pattern, identified trade-offs, risks.}

REFERENCES:
- [Context7] {lib/framework}: {relevant excerpt}
- [Codebase] {path}: {description}
- [External] {link or RFC}: {summary}

---

OPEN_QUESTIONS:
- {Unanswered question or assumption made}
- {Identified ambiguity}
```
</output-format>

<constraints>
## Rules

1. NEVER generate code — only the textual SEED for the `specify` step
2. ALWAYS cite sources (Context7 docs, codebase paths, JIRA links)
3. Write the SEED content in the same language as the JIRA ticket (PT-BR or EN)
4. If a field has no available information, use "N/A" or "To be determined"
5. Prefer `ia-framework` over bash for codebase search
6. Acceptance criteria MUST use the Gherkin format (Given/When/Then)
7. The output is structured PLAIN TEXT — not formatted markdown
8. Maximum 3 owner questions via the question tool (shared between clarification
   and handoff)
9. NEVER run `specify` automatically — show the command and let the user
   authorize it (the slash-command is the authorization)
10. The SEED body is the SAME for any `--target`; only the handoff hint changes
</constraints>
