# Quickstart: Configurable Agent Docs Injection Targets

## For users: choose which repos receive agent instructions

Edit `.ia-framework/project.json` and set `injectAgents: true` on the repos you
want (opt-in — default is `false`):

```json
{
  "repos": [
    { "path": "../frontend", "injectAgents": true },
    { "path": "../backend",  "injectAgents": true },
    { "path": "../shared" }
  ],
  "embedding": { "...": "..." },
  "vectorStore": { "...": "..." }
}
```

Then inject:

```bash
ia-framework agents inject
```

Only `frontend` and `backend` get their `AGENTS.md` (or `CLAUDE.md`) updated;
`shared` is untouched. Re-running refreshes existing blocks in place (no
duplication). If no repo is flagged, the command reports "no injection target
configured" and changes nothing.

Check status across all targets:

```bash
ia-framework agents check
```

During `install.sh`, if you haven't flagged any repo yet, the installer offers a
checkbox prompt to pick targets and saves your choice back to `project.json`.

Legacy configs using `targetProjectPath` keep working unchanged — that single
target is injected as before.

## For developers: verification steps (TDD order)

1. **Schema** (`packages/core`): `pnpm --filter @ia-framework/core test schema` — `injectAgents` accepted as boolean, optional, defaults false; non-boolean rejected.
2. **Registry**: `pnpm --filter @ia-framework/core test registry` — `getInjectionTargets()` returns none/some/all correctly; legacy target implicitly opted-in; `toJSON()` preserves `injectAgents`; dedupe by path.
3. **CLI inject** (`packages/cli`): `pnpm --filter @ia-framework/cli test agents` — multi-target injection; per-target result summary; zero-target no-op + message; refresh idempotency; extended block contains Context7 and Sequential Thinking sections.
4. **Full gate**: `pnpm test && pnpm build` (constitution Quality Gate).

## Acceptance mapping

| Spec item | Verified by |
|-----------|-------------|
| FR-001 / FR-001a | schema + registry tests (flag, default false) |
| FR-002 / FR-003 | registry `getInjectionTargets` + CLI multi-target test |
| FR-004 | CLI zero-target no-op test |
| FR-005 | registry "all/some" selection test |
| FR-006 / FR-007 | CLI refresh + create precedence test |
| FR-008 | registry legacy implicitly-opted-in test |
| FR-009 | schema invalid-type test |
| FR-010 / FR-010a | installer wiring + CLI non-interactive test |
| FR-011 / FR-012 | CLI per-target summary + continue-on-failure test |
| FR-013–FR-016 / SC-007 / SC-008 | CLI injected-content assertions (Context7 + Sequential Thinking inside single block) |
