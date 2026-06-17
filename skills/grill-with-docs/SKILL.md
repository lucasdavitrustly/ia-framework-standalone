---
name: grill-with-docs
description: Grilling session that challenges your plan against the existing domain model, sharpens terminology, and updates documentation (CONTEXT.md, ADRs) inline as decisions crystallise. Use when user wants to stress-test a plan against their project's language and documented decisions.
---

<what-to-do>

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one.

Keep the conversation flowing until there are no remaining doubts or grey areas to explore.

If a question can be answered by exploring the codebase, explore the codebase instead.

</what-to-do>

<interaction-rules>

## Interaction model: question tool only

ALL interaction with the user MUST go through the **question tool**. Never ask questions via plain text output.

For each decision point:

1. **Research first** — use codebase exploration, Context7, and web tools to gather evidence silently.
2. **Present via question tool** — for every alternative, include:
   - **Pros** — concrete advantages with evidence
   - **Cons** — concrete disadvantages with evidence
   - **Your recommendation** — mark it clearly (e.g. "(Recommended)" in the label)
3. **Wait for the answer** — do not proceed until the user responds.
4. **Repeat** — continue asking via question tool until all branches of the design tree are resolved and no grey areas remain.

You MAY use prose (plain text output) to:
- Present reasoning, context, or summaries BETWEEN questions
- Explain why you are asking a particular question
- Summarize decisions made so far

You MUST NOT use prose to:
- Ask the user to make a choice
- Request confirmation or feedback
- Solicit any input that requires a response

When the grilling session is complete (no remaining ambiguity), output a final summary of all decisions made.

</interaction-rules>

<tooling-strategy>

## 1. Zero guesswork — research before recommending

NEVER assume best practices based on generic knowledge. For every technical
recommendation:

1. Use MCP Context7 to look up current documentation:
   - `context7_resolve-library-id` — get the library ID
   - `context7_query-docs` — query up-to-date docs/examples
2. Use web access tools (webfetch, websearch) to validate against external
   sources when Context7 does not cover the topic.
3. **If Context7 is NOT available in the session:**
   - Inform the user: "The Context7 MCP is not available in this session.
     To enable documentation lookup, install it in your IDE as described in
     the ia-framework setup (`./install.sh`)."
   - Continue using webfetch/websearch as fallback, but warn that response
     quality may be lower.
4. Only present recommendations backed by documentary evidence.
   Cite the source (URL, doc page, or Context7 excerpt).

## 2. Codebase-first via MCP ia-framework

To explore or understand the codebase, PRIMARILY use these MCP tools:

| Tool | Purpose |
|------|---------|
| `ia-framework_search_codebase` | Semantic search by concepts |
| `ia-framework_search_codebase_hybrid` | Search by identifiers + semantics |
| `ia-framework_get_file` | Full content of an indexed file |
| `ia-framework_get_dependencies` | Imports/exports of a file |

**If ia-framework MCP is NOT available:**
- Inform the user: "The ia-framework MCP is not accessible. Codebase
  exploration will use local tools (slower and less precise).
  Run `./install.sh` to configure the MCP server."
- Use fallback: Glob (file pattern search), Grep (regex content search),
  Read (direct file reading).

## 3. Project context via specs/

BEFORE starting any grilling, perform this mandatory preparation:

1. List the contents of the project's `specs/` directory
2. Identify the spec with the highest number (most recent = active context)
3. Read from the active spec: `plan.md`, `spec.md`, `data-model.md`
4. Read previous specs as relevant to the topic under discussion
5. Use this context to:
   - Ask more informed questions
   - Challenge against decisions ALREADY documented
   - Identify contradictions between the proposed plan and prior decisions
   - Reference terms and models already defined

</tooling-strategy>

<supporting-info>

## Domain awareness

During codebase exploration, also look for existing documentation:

### File structure

Most repos have a single context:

```
/
├── CONTEXT.md
├── docs/
│   └── adr/
│       ├── 0001-event-sourced-orders.md
│       └── 0002-postgres-for-write-model.md
└── src/
```

If a `CONTEXT-MAP.md` exists at the root, the repo has multiple contexts. The map points to where each one lives:

```
/
├── CONTEXT-MAP.md
├── docs/
│   └── adr/                          ← system-wide decisions
├── src/
│   ├── ordering/
│   │   ├── CONTEXT.md
│   │   └── docs/adr/                 ← context-specific decisions
│   └── billing/
│       ├── CONTEXT.md
│       └── docs/adr/
```

Create files lazily — only when you have something to write. If no `CONTEXT.md` exists, create one when the first term is resolved. If no `docs/adr/` exists, create it when the first ADR is needed.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the existing language in `CONTEXT.md`, call it out immediately. "Your glossary defines 'cancellation' as X, but you seem to mean Y — which is it?"

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying 'account' — do you mean the Customer or the User? Those are different things."

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about the boundaries between concepts.

### Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire Orders, but you just said partial cancellation is possible — which is right?"

### Update CONTEXT.md inline

When a term is resolved, update `CONTEXT.md` right there. Don't batch these up — capture them as they happen. Use the format in [CONTEXT-FORMAT.md](./CONTEXT-FORMAT.md).

`CONTEXT.md` should be totally devoid of implementation details. Do not treat `CONTEXT.md` as a spec, a scratch pad, or a repository for implementation decisions. It is a glossary and nothing else.

### Offer ADRs sparingly

Only offer to create an ADR when all three are true:

1. **Hard to reverse** — the cost of changing your mind later is meaningful
2. **Surprising without context** — a future reader will wonder "why did they do it this way?"
3. **The result of a real trade-off** — there were genuine alternatives and you picked one for specific reasons

If any of the three is missing, skip the ADR. Use the format in [ADR-FORMAT.md](./ADR-FORMAT.md).

</supporting-info>
