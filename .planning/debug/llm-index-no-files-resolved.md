---
status: awaiting_human_verify
trigger: 'llm-index-no-files: `ia-framework index -s llm` reports 0 files found'
created: 2026-04-20T00:00:00Z
updated: 2026-04-20T00:00:00Z
---

## Current Focus

hypothesis: Empty array `[]` from Zod default bypasses nullish coalescing fallback to `['**/*']`
test: confirmed by reading code
expecting: n/a
next_action: fix file-walker.ts line 72 to treat empty array same as undefined

## Symptoms

expected: LLM chunking strategy should discover and index files the same way AST strategy does
actual: 0 files found when using `-s llm` flag
errors: No error — just finds no files
reproduction: Run `ia-framework index -s llm` against any target project
started: Regression from fix that changed includePatterns default from undefined to []

## Eliminated

## Evidence

- timestamp: 2026-04-20
  checked: file-walker.ts line 72
  found: `const patterns = includePatterns ?? ['**/*']` — nullish coalescing doesn't trigger for `[]`
  implication: empty array passes through, glob matches nothing

- timestamp: 2026-04-20
  checked: core/src/config/schema.ts line 26
  found: `includePatterns: z.array(z.string()).default([])` — Zod defaults to empty array
  implication: after config parsing, includePatterns is always `[]`, never undefined

- timestamp: 2026-04-20
  checked: cli index.command.ts line 423
  found: `includePatterns: config.indexing?.includePatterns` passes the `[]` through
  implication: both AST and LLM strategies affected (AST may also be broken post-fix, or tested before the Zod default change)

## Resolution

root_cause: Zod schema defaults `includePatterns` to `[]`. In file-walker.ts:72, `[] ?? ['**/*']` evaluates to `[]` (not undefined/null), so glob receives empty patterns array and matches 0 files.
fix: Change line 72 to check for empty array, not just nullish
verification: All 61 tests pass including new test for empty includePatterns
files_changed: [packages/indexer/src/file-walker.ts, packages/indexer/src/pipeline.test.ts]
