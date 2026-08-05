import { Command } from 'commander';
import { readFile, writeFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { loadConfig, RepoRegistry } from '@ia-framework/core';
import type { InjectionTarget } from '@ia-framework/core';

export const RAG_MARKER_START = '<!-- ia-framework:rag-start -->';
export const RAG_MARKER_END = '<!-- ia-framework:rag-end -->';

export const RAG_CONTENT = `## Codebase RAG Tools (ia-framework)

This project is indexed by ia-framework. The following MCP tools provide
codebase context during AI-assisted development:

- \`search_codebase\` — Semantic search across the indexed codebase using
  query auto-classification (semantic / keyword / existence / aggregation).
  Results include live file content for the top-5 matches and metadata-only
  for results 6-10. Stale results (file changed since indexing) are flagged.
  Parameters: \`query\` (required), \`limit\` (default 10), \`score_threshold\`
  (default 0.5), \`expand_hops\` (0=no expansion, 1=direct imports, 2=transitive),
  \`fallback\` (default true), \`repo\`, \`stereotype\`, \`archLayer\`, \`module\`,
  \`language\` — optional filters for precise retrieval. The \`repo\` value of a
  result is the repo name you pass to \`get_file\` as a \`repo:\` prefix.
- \`get_file\` — Retrieve a file's content and indexed chunk metadata by path.
  Reads live content from the filesystem first; falls back to stored Qdrant
  content if the file is not accessible. The \`path\` accepts an optional
  \`repo:\` prefix to target a specific repo, e.g.
  \`get_file(path="achpro:src/main/java/Foo.java")\`. Supports optional \`name\`
  filter (returns only matching function/class chunks) and \`startLine\`/\`endLine\`
  range filter for targeted retrieval — use search_codebase results to
  inform targeted get_file calls (e.g., after finding \`Entry.java:166-231 (create)\`,
  call \`get_file\` with \`name: "create"\` or \`startLine: 166, endLine: 231\`).
  Parameters: \`path\` (required, optionally \`repo:path\`), \`name\` (optional,
  case-insensitive chunk filter), \`startLine\`/\`endLine\` (optional, 1-indexed line range).
- \`get_dependencies\` — Get dependency graph for a file or module.
  Supports \`path\` (file-level) OR \`module\` (module-level with BFS traversal).
  Returns \`imports\`, \`exports\`, and full \`dependencyEdges\` for graph navigation.
  Parameters: \`path\` OR \`module\` (one required), \`depth\` (BFS hops, default 1).

### Multi-repo path resolution

This project may index more than one repo. File paths are **relative to each
repo's root**, so the same \`relativePath\` (e.g. \`src/main/java/Foo.java\`) can
exist in several repos.

- When calling \`get_file\`, prefix the path with the owning repo:
  \`get_file(path="<repo>:<relativePath>")\`.
- Get the \`<repo>\` value from the \`repo\` field of \`search_codebase\` results.
- Without a prefix, \`get_file\` reads from whichever repo the indexed chunks
  belong to; if the path matches multiple repos, results are returned grouped
  under \`## [repo]\` headings so you can disambiguate — re-issue the call with
  the correct \`repo:\` prefix to target one.
- An unknown \`repo:\` prefix is rejected with an error rather than silently
  reading the wrong file.

### Dependency graph expansion (\`expand_hops\`)

\`expand_hops\` controls how far \`search_codebase\` walks the **dependency graph**
outward from each direct match. After the initial semantic/keyword hits, the
engine follows edges — \`imports\`, \`extends\`/superclass chains, and interface
\`implements\` — to pull related files into the **same response**, so you get the
matched code *plus* the context it depends on without extra round-trips.

| Value | Meaning | Use when |
|-------|---------|----------|
| \`0\` | No expansion — only the direct matches | You know the exact symbol, or a definition you can answer from the \`[signature]\` snippet. Cheapest in tokens. |
| \`1\` | Direct imports — one level of dependency/superclass/impl edges | You need the match plus its immediate collaborators (e.g. a class and the types it directly uses). |
| \`2\` | Transitive — follows the chain two levels deep **(default)** | Tracing a flow, or enumerating "who implements/extends X" across the graph. |

**What expansion pulls in (when \`expand_hops > 0\`):**

- **Import edges** — files the matched file imports.
- **Hierarchy** — walks superclass chains up to N levels (results tagged
  \`[hierarchy]\`).
- **Interface implementations** — for an \`interface\` match, finds its
  implementing classes.
- **Cross-repo** — expansion follows edges across repository boundaries.
  **Each repo-boundary crossing costs 1 hop** from the budget: with
  \`expand_hops=2\` you can cross into another repo (1 hop) then expand 1 more
  level inside it. Results that came from another repo via expansion are
  annotated \`[via <repo>]\`.

**Bounds & behaviour you can rely on:**

- The value is **clamped to 0–2** and rounded — passing \`5\` is treated as \`2\`,
  negatives as \`0\`. There is no way to expand deeper than 2.
- Omitting \`expand_hops\` uses the server default (\`2\`). You (the agent) set it
  per call; you cannot raise the ceiling.
- **Token budget is shared 70/30:** direct results get 70% of the budget,
  expanded neighbors get the remaining 30%. If direct results already exceed
  70%, neighbor expansion is suppressed. So a high \`limit\` + \`expand_hops=2\`
  can crowd out the expansion you asked for — prefer a smaller \`limit\` when you
  rely on expansion.

**Examples:**

\`\`\`
# Exact match only — no surrounding context (cheapest)
search_codebase(query="EntryService.create", expand_hops=0)

# Match + immediate collaborators
search_codebase(query="payment retry policy", expand_hops=1)

# Trace a flow / enumerate implementations (default behaviour)
search_codebase(query="how entries are persisted", expand_hops=2)
\`\`\`

**Rule of thumb:** definitions and needle lookups → \`expand_hops=0\`;
"who implements / how does this flow work" → \`expand_hops=2\` with a modest
\`limit\` so the 30% neighbor budget isn't starved.

### When to use

- **Before modifying code:** \`search_codebase\` to find related files, then
  \`get_file\` to read the target before editing
- **Before planning features:** \`search_codebase\` with \`archLayer\` or
  \`stereotype\` filters to find patterns (e.g., \`stereotype: "service"\`)
- **Before refactoring:** \`get_dependencies\` to understand the impact surface
- **Finding all implementations of an interface:** \`search_codebase\` with
  \`expand_hops: 2\` to follow the dependency graph transitively (see
  "Dependency graph expansion (\`expand_hops\`)" above for the full mechanics)

### Verify with MCP — never assume

Do not assume project facts; confirm them against the indexed codebase before
reasoning, planning, or editing. When in doubt, check the MCP.

- **Build system & project topology:** never guess Maven vs Gradle, the module
  list, or dependency wiring. Build manifests are indexed — query them, e.g.
  \`get_file(path="pom.xml", repo="<repo>")\` (or \`settings.gradle\`/\`build.gradle\`).
  Prefer this over \`glob\`/\`find\` on disk.
- **"Does file X exist / where is it?":** ask \`search_codebase\` or \`get_file\`
  first. \`glob\`/\`find\` over the working dir is error-prone because anchor paths
  are repo-relative (see Multi-repo path resolution) — a wrong base path returns
  a misleading empty result that is *not* proof of absence.
- **Ambiguous filenames across repos** (e.g. \`pom.xml\`, common class names):
  always pass \`repo:\` to avoid multi-repo dumps and disambiguation round-trips.
- **Treat negative/empty tool results as "re-query with the right repo/path,"**
  not as a conclusion. Re-anchor via \`search_codebase\` before falling back to
  shell tools.
- Reserve \`bash\` (\`find\`/\`grep\`) and \`glob\` for what the index genuinely cannot
  answer (on-disk-only files, build output), and only after an MCP check.

### Filter examples

- Services in payments module: \`{ stereotype: "service", module: "payments" }\`
- All controllers: \`{ archLayer: "presentation" }\`
- Java only: \`{ language: "java" }\`

### Token-conscious usage

- Use \`limit: 3-5\` for quick lookups, \`limit: 10\` for deep exploration
- Raise \`score_threshold\` to 0.7 for precise matches
- Use \`get_file\` with \`name\` or \`startLine\`/\`endLine\` instead of fetching entire files
- Skip RAG for tasks that don't need codebase context (doc updates, config changes)
- Top-5 results include live code; results 6-10 are metadata-only to save tokens

### Token-efficient retrieval (universal rules)

Output tokens (tool results) dominate cost — not the queries themselves. The
two biggest wastes are (1) calling \`get_file(path, name:"<ClassName>")\` on a
large or \`sealed\`/aggregate class — it returns the full \`class-signature\` block
**plus** duplicated \`$part1/$part2/$partN\` chunks **plus** per-function blocks
(the same code 2-3×) — and (2) extra round-trips caused by mid-stream discovery.
Whole-file \`Read\`s and re-fetching content already shown in snippets follow.
These rules hold for **every** scenario below:

1. **Plan all fetches up front, then batch.** After the first search, write the
   complete fetch list (paths + line ranges) BEFORE issuing any \`get_file\`, then
   send them in as few batched messages as possible. The budget is blown by
   *extra round-trips*, not by any single payload. Hard rule: **no mid-stream
   discovery** — if you find yourself searching again to locate a parent class
   or collaborator you could have anticipated, fold it into the up-front plan.
   Target ≤3 round-trips for a definitional question.
2. **Answer from snippets before fetching, and read inheritance from the
   \`[signature]\` snippet.** A \`[signature]\`-tagged result exposes the
   \`extends\`/\`implements\`/\`permits\` clause — read the parent/sealed-base name
   straight from it and add the parent's field block to your plan *now*, instead
   of fetching the child then discovering the parent.
3. **Prefer \`startLine\`/\`endLine\` over \`name:\`.** Default to reading just the
   field block + method *signatures* with a line range. **Never use \`name:\` on a
   large/\`sealed\`/aggregate class** — it triplicates output. Reserve \`name:\` for
   a single small method whose body you actually need.
4. **\`get_dependencies\` (graph) instead of re-\`search\` or whole-file reads** for
   "what's connected / who calls / what breaks" questions — it returns edges, not
   bodies, and is the cheapest high-value call in the MCP.
5. **\`rg\` (ripgrep) for exact symbols, \`search_codebase\` for concepts.** For an
   exact call-site/usage of a known symbol, shell \`rg\` returns just \`file:line\`
   matches — far cheaper than semantic chunks. Use semantic search only for
   conceptual queries ("where do we handle retries?").
6. **Needle lookups skip semantic search.** If you already know the class/method
   name, use \`glob\` for the file or \`get_file(path, name:X)\` for one small
   member — don't pay for a semantic query.
7. **Never the generic \`Read\` tool for indexed files.** \`Read\` ignores
   \`name:\`/\`startLine\`-\`endLine\` filters (pulling whole files) and auto-loads
   nested \`AGENTS.md\` files — both defeat the budget. On a wrong-module or empty
   \`get_file\`, re-run \`search_codebase\` for the right anchor; do **not** fall
   back to shell \`find\` + \`Read\`.
8. **Pass \`repo:\` when the name is dual-repo or you're unsure.** Carry the
   \`[repo]\` tag forward from search anchors. One extra token in the request is
   cheaper than a duplicated multi-repo response + an ambiguity round-trip.
9. **Full-read only small files** (enums/records under ~50 lines), and **stop on
   sufficiency** — end retrieval the moment the question is answered.

### Scenario playbook

Pick the tactic by question type. All scenarios still obey the universal rules.

| Scenario | Strategy |
|----------|----------|
| **"What is X?"** (definition) | search (\`limit:5, score_threshold:0.6, expand_hops:0\`) → answer from \`[signature]\` snippet → fetch only field blocks via \`startLine\`/\`endLine\`. Never \`name:\` on a sealed/large class. |
| **"Who implements / extends X?"** | search \`limit:10\` and read the **metadata-only results 6-10** to enumerate candidates cheaply; or \`get_dependencies(path)\` for reverse edges; or \`expand_hops:2\` to follow the graph. Stop at class signatures — don't fetch each impl body. Narrow with \`stereotype\`. |
| **"How does X work?" / trace a flow** (the expensive one) | search once for the entry point, then **plan the whole call chain up front** from snippets. Per hop, fetch only the specific method via \`startLine\`/\`endLine\` (\`name:\` OK for one *small* method). Use \`get_dependencies\` to find the next hop instead of re-searching. Cost driver is breadth — don't fetch collaborators you won't cite. |
| **"Where is X called / used?"** | For an exact symbol, \`rg\` returns \`file:line\` cheaply; \`get_dependencies\` reverse edges also list callers without bodies. Use \`search_codebase\` only for conceptual usage. |
| **"Find the class/method named X"** (needle) | Skip semantic search — \`glob\` the file or \`get_file(path, name:X)\` for one small member. |
| **"What breaks if I change X?"** (refactor blast radius) | \`get_dependencies(path or module, depth:2)\` for the edge graph; combine with \`rg\` for exact call-site counts before reading any file. |
| **Existence / aggregation** ("is there a retry mechanism?") | Auto-routed in \`search_codebase\`. Use \`limit:3-5\`, answer from snippets, stop on sufficiency — no completeness sweep. |
| **Before editing a file** | \`get_file\` with \`startLine\`/\`endLine\` for just the region you'll edit. Never whole-file \`Read\` of an indexed file. |

### Worked example — "what is an Entry?" done right (~15-25k tokens)

1. \`search_codebase("Entry domain class", repo:"payment-gateway", limit:5,
   score_threshold:0.6, expand_hops:0)\`. The \`Entry$part1 [signature]\` snippet
   shows \`final class Entry extends EntryCore\` — so the plan is fixed up front:
   (a) Entry decl + fields, (b) EntryCore parent fields, (c) the two enums.
2. Batch plan items (a)+(b) in **one message**:
   \`get_file(repo:"payment-gateway", path:".../Entry.java", startLine:34, endLine:62)\`
   + \`get_file(repo:"payment-gateway", path:".../EntryCore.java", startLine:35, endLine:57)\`
   — fields only, no method bodies. **Do not** \`get_file(name:"EntryCore")\` —
   that one call triplicates ~500 lines of a \`sealed\` class and is the single
   biggest budget blow-out.
3. Batch plan item (c): read the small \`EntryType\` / \`EntryStatus\` enums whole,
   each with the \`repo:\` prefix (those names exist in two repos).
4. Three round-trips total. Stop once type + status are covered.

## When to use Context7

Context7 provides up-to-date documentation for libraries, frameworks, SDKs, APIs,
and CLI tools. Use it whenever a task depends on a specific library's current API,
configuration, version migration, or CLI usage — even for well-known libraries —
because training data may lag behind recent releases.

- **Use it for**: library/framework API syntax, configuration options, setup and
  installation steps, version/migration questions, and library-specific debugging.
- **How**: resolve the library ID first (from the library name), then query the
  specific task. Prefer Context7 over generic web search for any library-specific
  documentation question.
- **Do NOT use it for**: refactoring, writing scripts from scratch, debugging your
  own business logic, code review, or general programming concepts unrelated to a
  specific library.

## When to use Sequential Thinking

Sequential Thinking supports structured, multi-step, and revisable reasoning. Use
it when a problem benefits from explicit, adjustable steps rather than a single
answer.

- **Use it for**: breaking complex problems into steps, planning/design work that
  may need revision, analysis that might require course-correction, and multi-step
  tasks where earlier conclusions may be reconsidered as understanding deepens.
- **How**: express the reasoning as a sequence of thoughts, revising or adding
  steps as needed, and converge on a single verified conclusion.
- **Do NOT use it for**: trivial, single-step changes (e.g. a one-line edit, a
  wording tweak) where the extra structure adds no value.

## Database migrations

When creating a **new database migration** in a repo that uses Flyway (versioned
\`V…__….sql\` migration files), follow the standardized naming convention below.
This applies only to **new** migrations — never rename existing ones.

- **Allowed characters:** the filename contains only **letters, numbers, and
  underscores**, and ends with the \`.sql\` extension. No spaces or special
  characters.
- **Template:** \`V9.999.9.N__descriptive_snake_case_name.sql\`
    - Start with the placeholder version prefix \`V9.999.9.N\`, where **N** is the
      next ordering integer (\`1\`, \`2\`, \`3\`, … — any integer from 1 upward).
    - Follow the version with **two underscores** (\`__\`) as the separator.
    - Then a snake_case description of what the migration does.
- **Examples:**
    - \`V9.999.9.1__first_migration_add_user_index.sql\`
    - \`V9.999.9.2__second_migration_add_another_user_index.sql\`
- **Do not hand-pick a real Flyway version** (e.g. \`V1.269.0.1\`). Always use the
  \`V9.999.9.N\` placeholder for new migrations — a GitHub Action rewrites it to the
  correct version and ordering when the PR is merged. A companion Action rejects
  non-compliant migration names in the PR.
- **Never rename existing migrations.** Flyway validates migrations by checksum,
  so renaming an already-applied migration breaks validation.

Before writing a migration, verify the repo's existing migrations directory and
the current highest \`N\` (use \`search_codebase\` / \`glob\` — do not assume the path
or ordering). Authority: Trustly ADR "Standardizing Naming Conventions for
Database Migrations"
(https://trustly.atlassian.net/wiki/spaces/ARCH/pages/71295697209).`;

function getConfigPath(options: { config?: string }): string {
  return (
    options.config ||
    process.env['IA_FRAMEWORK_CONFIG'] ||
    join(process.cwd(), '.ia-framework', 'project.json')
  );
}

/**
 * Check if a file exists.
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the agent doc file for a target directory:
 * existing AGENTS.md → existing CLAUDE.md → default to creating AGENTS.md.
 */
async function resolveAgentDocFile(projectRoot: string): Promise<string> {
  const agentsPath = join(projectRoot, 'AGENTS.md');
  const claudePath = join(projectRoot, 'CLAUDE.md');
  if (await fileExists(agentsPath)) return agentsPath;
  if (await fileExists(claudePath)) return claudePath;
  return agentsPath;
}

type InjectionStatus = 'injected' | 'refreshed' | 'created' | 'skipped' | 'failed';

interface InjectionOutcome {
  target: string;
  file?: string | undefined;
  status: InjectionStatus;
  error?: string | undefined;
}

/**
 * Inject into a single file and report whether it was created, injected (new
 * markers into an existing file), or refreshed (markers already present).
 */
async function injectIntoFileWithStatus(filePath: string): Promise<InjectionStatus> {
  const block = `${RAG_MARKER_START}\n${RAG_CONTENT}\n${RAG_MARKER_END}`;

  let existing = '';
  try {
    existing = await readFile(filePath, 'utf-8');
  } catch {
    await writeFile(filePath, `${block}\n`);
    return 'created';
  }

  const startIdx = existing.indexOf(RAG_MARKER_START);
  const endIdx = existing.indexOf(RAG_MARKER_END);

  if (startIdx !== -1 && endIdx !== -1) {
    const before = existing.slice(0, startIdx);
    const after = existing.slice(endIdx + RAG_MARKER_END.length);
    await writeFile(filePath, `${before}${block}${after}`);
    return 'refreshed';
  }

  const separator = existing.endsWith('\n') ? '\n' : '\n\n';
  await writeFile(filePath, `${existing}${separator}${block}\n`);
  return 'injected';
}

/**
 * Resolve the configured directory that project.json paths are relative to.
 */
function configDirFor(configPath: string): string {
  return dirname(configPath);
}

// ── inject subcommand ─────────────────────────────────────────────────────────

function injectSubcommand(): Command {
  return new Command('inject')
    .description('Inject RAG tools guidance into target project agent documentation')
    .option('-c, --config <path>', 'Path to project.json config', '')
    .option('--file <path>', 'Target file path (overrides target resolution)')
    .action(async (options: { config: string; file?: string }) => {
      const configPath = getConfigPath(options);

      let config;
      try {
        config = await loadConfig(configPath);
      } catch (err) {
        console.error(`Failed to load config: ${String(err)}`);
        process.exit(1);
        return;
      }

      // --file forces a single explicit target, bypassing resolution.
      if (options.file) {
        try {
          const status = await injectIntoFileWithStatus(options.file);
          console.log(`RAG guidance ${status}: ${options.file}`);
        } catch (err) {
          console.error(`Failed to inject: ${String(err)}`);
          process.exit(1);
        }
        return;
      }

      // Resolve designated targets from the config (repos[] flags + legacy + extras).
      let targets: InjectionTarget[];
      try {
        targets = RepoRegistry.fromConfig(config, configDirFor(configPath)).getInjectionTargets();
      } catch (err) {
        console.error(`Failed to resolve injection targets: ${String(err)}`);
        process.exit(1);
        return;
      }

      if (targets.length === 0) {
        console.log(
          'No injection target configured. Set "injectAgents": true on a repo in ' +
            'project.json (or add "agentInjectionTargets"), or run the installer to choose.',
        );
        return;
      }

      const outcomes: InjectionOutcome[] = [];
      for (const target of targets) {
        try {
          const file = await resolveAgentDocFile(target.path);
          const status = await injectIntoFileWithStatus(file);
          outcomes.push({ target: target.path, file, status });
        } catch (err) {
          outcomes.push({ target: target.path, status: 'failed', error: String(err) });
        }
      }

      // Per-target summary (FR-011).
      for (const o of outcomes) {
        if (o.status === 'failed') {
          console.log(`  ${o.target} — failed (${o.error ?? 'unknown error'})`);
        } else {
          console.log(`  ${o.target} — ${o.status} (${o.file ?? ''})`);
        }
      }
      const counts = outcomes.reduce<Record<InjectionStatus, number>>(
        (acc, o) => {
          acc[o.status] += 1;
          return acc;
        },
        { injected: 0, refreshed: 0, created: 0, skipped: 0, failed: 0 },
      );
      console.log(
        `Injected: ${counts.injected}  Refreshed: ${counts.refreshed}  ` +
          `Created: ${counts.created}  Skipped: ${counts.skipped}  Failed: ${counts.failed}`,
      );

      if (counts.failed > 0) {
        process.exit(1);
      }
    });
}

// ── check subcommand ──────────────────────────────────────────────────────────

function checkSubcommand(): Command {
  return new Command('check')
    .description('Check if RAG tools guidance is present in target project agent docs')
    .option('-c, --config <path>', 'Path to project.json config', '')
    .action(async (options: { config: string }) => {
      const configPath = getConfigPath(options);

      let config;
      try {
        config = await loadConfig(configPath);
      } catch (err) {
        console.error(`Failed to load config: ${String(err)}`);
        process.exit(1);
        return;
      }

      let targets: InjectionTarget[];
      try {
        targets = RepoRegistry.fromConfig(config, configDirFor(configPath)).getInjectionTargets();
      } catch (err) {
        console.error(`Failed to resolve injection targets: ${String(err)}`);
        process.exit(1);
        return;
      }

      if (targets.length === 0) {
        console.log('No injection target configured. Run: ia-framework agents inject');
        return;
      }

      const candidates = ['AGENTS.md', 'CLAUDE.md'];
      let anyFound = false;

      for (const target of targets) {
        const foundHere: string[] = [];
        for (const name of candidates) {
          const filePath = join(target.path, name);
          try {
            const content = await readFile(filePath, 'utf-8');
            if (content.includes(RAG_MARKER_START)) {
              foundHere.push(name);
            }
          } catch {
            // File doesn't exist — skip
          }
        }
        if (foundHere.length > 0) {
          anyFound = true;
          console.log(`  ${target.path} — found in: ${foundHere.join(', ')}`);
        } else {
          console.log(`  ${target.path} — not injected`);
        }
      }

      if (!anyFound) {
        console.log('RAG guidance not found. Run: ia-framework agents inject');
      }
    });
}

// ── top-level agents command ──────────────────────────────────────────────────

export function agentsCommand(): Command {
  const cmd = new Command('agents').description('Target project agent documentation commands');
  cmd.addCommand(injectSubcommand());
  cmd.addCommand(checkSubcommand());
  return cmd;
}
