---
name: tlc-specify
description: >
  Start a new feature specification with the tlc-spec-driven workflow. Captures
  testable, traceable requirements (spec.md) for the feature described by the
  argument. Runs in the current working directory (the worktree is created earlier,
  during initial setup / start-work-on).
argument-hint: '"<ticket key or feature description>"'
tools:
  read: true
  write: true
  edit: true
  bash: true
  glob: true
  grep: true
---

<objective>
Execute the **Specify** phase of the tlc-spec-driven skill for a new feature
described by `$ARGUMENTS`. Capture WHAT the feature must do and WHY, as testable
requirements. This command does NOT create a worktree — it assumes the working
directory is already the correct place to specify (the worktree is set up earlier
in the flow, e.g. by `/start-work-on`).
</objective>

<process>
1. **Validate input**: if `$ARGUMENTS` is empty, PROMPT the user for a one-line
   feature description or ticket key and wait — do NOT produce an empty spec.

2. **Extract ticket key (if present)**:
   - Check if `$ARGUMENTS` contains a JIRA ticket key (pattern: `[A-Z]+-[0-9]+`,
     e.g., `DEV-277503`).
   - If a ticket key is found, extract it. The remaining text (if any) is the
     feature description. If only the ticket key is provided, use the ticket
     summary from JIRA as the description (fetch via MCP `getJiraIssue` with
     `cloudId: "trustly.atlassian.net"`).
   - If NO ticket key is found, treat the entire argument as a free-text
     description (sequential numbering will be used).

3. **Determine the feature number and directory**:
   - When a ticket key is present, the feature name is `<TICKET_KEY>-<slug>`
     (e.g., `DEV-277503-expected-effective-datetime`).
   - Otherwise, compute the next sequential number `NNN` from existing entries
     under `.specs/features/`, and derive a slug from the description.
   - The spec lives under `.specs/features/<feature-name>/`.

4. **Run the Specify phase**: load the skill reference `references/specify.md` and
   follow it as authoritative. Create the feature's `spec.md` (and a quality
   checklist) under `.specs/features/<feature-name>/`.

5. **Recommend the next phase (based on open questions):**
   - If the resulting `spec.md` ended with any open questions / gray areas
     (`## Open Questions` or `[NEEDS CLARIFICATION: ...]` markers), the next
     suggested step is **`/tlc-discuss`** to resolve them into `context.md`
     before designing. Make this the primary recommendation.
   - If the spec is clear and unambiguous (no open questions), recommend
     `/tlc-design` (or `/tlc-tasks` if the feature decomposes cleanly without
     architectural decisions).
   - Present the exact command to run; do not advance automatically (see SKILL.md
     → Phase Transition Enforcement).
</process>

<constraints>
- Behavior MUST match the natural-language "specify feature" trigger.
- This command does NOT create a git worktree and does NOT run a worktree guard —
  the worktree is created earlier in the flow (initial setup / `/start-work-on`).
- When the argument contains a JIRA ticket key, it MUST be used as the prefix
  for the feature/spec name (e.g., `DEV-277503-<slug>`). NEVER use a sequential
  number when a ticket key is provided.
- When the spec ends with open questions, the recommended next command MUST be
  `/tlc-discuss` (not `/tlc-design`) — gray areas are resolved before design.
- Do not design or implement here; this phase only specifies.
</constraints>
