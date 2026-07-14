---
name: jira-feed
description: SDD-agnostic spec-seed preparer. Turns a JIRA ticket into a structured, framework-neutral SEED and hands it off to the specify step of any spec-driven-development framework (TLC, SpecKit, OpenSpec). Fetches the ticket via the atlassian MCP, analyzes the codebase via ia-framework, researches docs via Context7, optionally grills the seed for gray areas, and never auto-runs specify. Triggers on "feed this JIRA ticket into specify", "prepare a spec seed from DEV-123", "start a feature from a JIRA ticket".
---

# jira-feed — JIRA → spec seed (SDD-agnostic)

Turns a JIRA ticket into a structured **SEED** that feeds the `specify` step of
any spec-driven-development framework. The seed body is framework-neutral; only
the handoff hint changes per `--target`. It is an **optional** feeder — a feature
can always be specified without JIRA by calling the framework's specify directly.

## Activation

On IDEs with slash-command support the entry point is the `/jira-feed` command.
On IDEs without slash commands it activates by natural language — e.g. "prepare a
spec seed from DEV-12345", "feed this ticket into TLC specify". Both paths run
the `jira-feed-formatter` agent.

## Command

| Command | What it does |
|---|---|
| `/jira-feed <ISSUE-KEY>` | Build the seed and hand off (default target `tlc`) |
| `/jira-feed <ISSUE-KEY> --target=tlc\|speckit\|openspec\|generic` | Choose the handoff destination |

## How it works

1. **Fetch** the ticket via the atlassian MCP (required; stop if unavailable).
2. **Analyze** the codebase via ia-framework (fallback: grep/glob).
3. **Research** current docs via Context7 + web.
4. **Clarify** critical ambiguities via the question tool (max 3, shared with handoff).
5. **Generate** the framework-neutral SEED (see `templates/jira-feed-output-guide.md`).
6. **Handoff** (question tool): *Start specify* (shows the exact `/tlc-specify
   "<seed>"` and stops — never auto-runs), *Emit seed only*, or *Grill first*.
   Grilling invokes `grill-with-docs` on the seed, persists the context to
   `.jira-feed/<ISSUE>-context.md`, and appends it to the seed passed to specify.

## Where it fits

```
/jira-feed DEV-123 → [handoff ± grill] → /tlc-specify "<seed[+context]>" → refuter (gate) → /tlc-design …
```

## Requirements

- Required: `atlassian` MCP (JIRA ticket data)
- Recommended: `context7` MCP (library documentation)
- Optional: `ia-framework` MCP (codebase search; graceful fallback)
