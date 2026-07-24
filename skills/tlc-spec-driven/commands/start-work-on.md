---
name: start-work-on
description: >
  Bootstraps multiple JIRA tickets in parallel by creating one isolated git
  worktree per ticket (fetching only the ticket TITLE to name it) and, for each
  one, handing off the next step — `/jira-feed <TICKET> --target=tlc` — to run
  for that worktree. When a launcher is available it opens one target per ticket
  already running `/jira-feed`, preferring opencode web (one session/tab per
  ticket via the server API, when `OPENCODE_WEB` is set), then Herdr (split
  right), then tmux (side-by-side panes), then a copyable block.
argument-hint: "[--repo=<path>] <TICKET-KEY> [<TICKET-KEY> ...]"
tools:
  read: true
  bash: true
  glob: true
  grep: true
  question: true
  jira_*: true
  atlassian_*: true
---

<objective>
Bootstrap several JIRA tickets in parallel so each one is ready to be specified.
For each ticket in `$ARGUMENTS`:
1. create an isolated git worktree (local branch, no push), naming it from the
   ticket TITLE fetched from JIRA;
2. hand off the next step for that ticket — `/jira-feed <TICKET> --target=tlc` —
   for its worktree (INSIDE the worktree for the terminal launchers, or with the
   worktree passed as context for the opencode web launcher). The SEED, codebase
   analysis, docs research and the handoff to `/tlc-specify` all happen later, in
   `/jira-feed`.

This command does NOT analyze the codebase, does NOT generate a SEED, and does
NOT write any spec. It only prepares worktrees and points to the next command.
When a launcher is available it can open one target per ticket running
`/jira-feed`, preferring opencode web (one session/tab per ticket, created via
the server API, when the user exported `OPENCODE_WEB`), then Herdr (split right),
then tmux (side-by-side panes), then a copyable block.
</objective>

<process>
### 1. Validate input

- Extract an optional `--repo=<path>` flag from `$ARGUMENTS` (the product
  repository where worktrees should be created). The rest are the ticket keys.
- Parse all remaining tokens matching the JIRA key pattern `[A-Z]+-[0-9]+`
  (e.g. `DEV-281896`, `DEV-277503`).
- If there are no ticket keys → PROMPT the user for at least one and wait.
  Do not continue without tickets.
- If a token does NOT match the pattern (and is not `--repo=`) → warn which one
  was ignored and confirm with the user before proceeding with the valid ones.

### 2. Determine the product repository (CRITICAL — never the skill repo)

Worktrees are created at `<PRODUCT_REPO_ROOT>/../worktrees/`, so
`PRODUCT_REPO_ROOT` MUST be the PRODUCT CODE repository where the work was started
(e.g. `.../paywithmybank/source/core`) — NEVER the skill repository
(`ia-framework`), which is only where the scripts live. The normal case is the
session repo (CWD); `--repo` and the prompt are fallbacks. Resolve in this order:

1. **If `--repo=<path>` was passed**, use it. Validate it is a git repo
   (`git -C "<path>" rev-parse --show-toplevel`); use the resulting toplevel.
2. **Otherwise, detect from the session CWD** (`git rev-parse --show-toplevel`).
3. **Reject the skill repo**: if the resolved toplevel points to the `ia-framework`
   repository (or any directory under `.config/opencode`/where the skill lives),
   it is NOT a valid product repo → do NOT use it. Go to step 4.
4. **If there is no valid product repo** (CWD is not git, or it is the skill repo,
   or `--repo` is absent): use the `question` tool to ask the user for the product
   repository path. To help, list the git candidates found under the known
   workspaces, for example by running:
   `find /Users/hider.oliveira/paywithmybank/source -maxdepth 2 -name .git -type d 2>/dev/null | sed 's#/.git##'`
   and offer those paths as options (e.g. `.../source/core`, `.../source/fi-connectors`).
   Do NOT proceed until you have a valid `PRODUCT_REPO_ROOT` git repo that is not the skill.

`SKILL_DIR` = the tlc-spec-driven skill directory (where the scripts are). It is
independent of `PRODUCT_REPO_ROOT` — the scripts are invoked from there via an
absolute path, but ALWAYS with `--repo "<PRODUCT_REPO_ROOT>"` to target creation.

**Note on permissions (external_directory):** worktrees live at
`<PRODUCT_REPO_ROOT>/../worktrees/` — i.e. a SIBLING of the repo, OUTSIDE the
session's workspace root (which is the repo itself, e.g. `source/core`). OpenCode
treats those paths as `external_directory` and, by default, asks for approval
(`ask`) — which can make later steps fail to write into the worktree. The
fix is to allow the worktree paths in `opencode.json` (global or project):
```
"permission": {
  "external_directory": {
    "~/paywithmybank/source/worktrees/**": "allow",
    "~/paywithmybank/source/**": "allow"
  }
}
```
If you detect this block at runtime, instruct the user to add that rule and re-run.

### 3. Fetch each ticket's TITLE from JIRA (BEFORE creating the worktree)

The worktree/branch name must reflect the ticket TITLE, not the ticket key. The
helper derives the slug from the description it receives — so we fetch ONLY the
JIRA summary HERE. We do NOT fetch the description, ACs, or anything else: the
full ticket analysis is `/jira-feed`'s job, later, inside the worktree. For each
ticket:

- Fetch via MCP JIRA (`getJiraIssue`) with `cloudId: "trustly.atlassian.net"` and
  extract the **summary** (title).
- Store `TITLE = <ticket summary>`.
- If JIRA is unavailable or the ticket does not exist for a given ticket:
  do NOT invent a slug from the key. Mark that ticket as **Blocked** (reason:
  "JIRA unavailable — could not obtain the title") and continue with the rest;
  it will not have a worktree created.

### 4. Create ALL worktrees sequentially (never in parallel)

Create the worktrees ONE AT A TIME. Reason: `git worktree add` is NOT
concurrency-safe — two simultaneous creations race on the bookkeeping in
`.git/worktrees/` and one ends up half-created (directory on disk, but no valid
git metadata → the guard later fails with "not a git repository"). The helper
also serializes via a lock as defense in depth, but this command MUST still
create sequentially. For each ticket (whose title was obtained in step 3):

```
sh <SKILL_DIR>/scripts/new-feature-worktree.sh --json --repo "<PRODUCT_REPO_ROOT>" --ticket "<TICKET>" --kind feature "<TITLE>"
```

- The last argument is the ticket **TITLE** (`<TITLE>`), from which the helper
  derives the slug — resulting in `<TICKET>-<title-slug>` (e.g.
  `DEV-277503-propagate-expected-effective-datetime`). NEVER pass the ticket key
  as the description (that produces the duplicated slug `DEV-277503-dev-277503`).
- Parse the JSON `{FEATURE_NUM, KIND, WORKTREE_PATH, BRANCH_NAME}` for each ticket.
- If the worktree already exists, the helper reports the path (no overwrite) — ok.
- If the helper reports it is not a git repository, or fails → STOP, show the
  message, and ask how to proceed BEFORE continuing.
- Store the list of `{TICKET, TITLE, FEATURE_NUM, WORKTREE_PATH, BRANCH_NAME}`.

### 4b. Validate each worktree's git integrity

Confirm that each created worktree is a VALID git worktree — not just a directory
on disk. For each `WORKTREE_PATH`:
```
git -C "<WORKTREE_PATH>" rev-parse --abbrev-ref HEAD
```

If it returns an error (`fatal: not a git repository ...`), the worktree was
corrupted (typically by concurrent creation). In that case, repair it:
```
rm -rf "<WORKTREE_PATH>"
git -C "<PRODUCT_REPO_ROOT>" worktree prune
# recreate with the helper (step 4)
```
If it cannot be repaired, mark the ticket as **Blocked** in the final output.

### 5. Prepare the handoff for each ticket

For every ticket with a valid worktree, the next step is ALWAYS:

```
/jira-feed <TICKET> --target=tlc
```

Compute `WORKTREE_RELATIVE_PATH` = the worktree path relative to
`PRODUCT_REPO_ROOT` (in practice `worktrees/<BRANCH_NAME>`). It is only used for
display/context; `/jira-feed` takes the ticket key, not a path.

**Choose ONE launcher, in this order of preference:**
`opencode web` (only when `OPENCODE_WEB` is truthy) → `herdr` → `tmux` → copyable
block. Pick the first one whose preconditions hold; if it fails mid-way, fall
back to the next — EXCEPT the web path: when `OPENCODE_WEB` is truthy the web
launcher is committed, and any failure goes STRAIGHT to the copyable block
(never to Herdr/tmux, since the user is not in a terminal multiplexer). In all
cases `opencode` must be on PATH (`command -v opencode`); if it is not, skip
straight to the copyable block.

#### Option A (preferred) — opencode web: one session/tab per ticket via the server API

**Precondition — explicit web context via env var.** There is NO environment
variable that opencode itself sets to signal "this is the web". `opencode web`
just starts a separate HTTP server (default `127.0.0.1:4096`); a session running
this command cannot otherwise tell it is "in the web". So this launcher is used
ONLY when the user OPTED IN by exporting `OPENCODE_WEB=true` before starting the
server, e.g.:

```
export OPENCODE_WEB=true && opencode web
```

The server inherits `OPENCODE_WEB`, so sessions created under it see it too.
Decision rule:

- If `OPENCODE_WEB` is truthy (`true`/`1`) → use this launcher. Once the web
  context is chosen, NEVER fall back to a terminal launcher (Herdr/tmux): if any
  step fails (server unreachable, health check fails, session create or dispatch
  fails), go STRAIGHT to Option D (copyable block). The user is in the web, not
  in a terminal multiplexer.
- Otherwise (not truthy) → SKIP straight to Option B (Herdr). Do NOT probe ports
  and do NOT use the web launcher, even if a server happens to be listening (it
  may be an unrelated `opencode web` while the user is actually in a TUI/Herdr
  session).

**Resolve the base URL** (only once `OPENCODE_WEB` is set):

1. If `--web-url=<base>` was passed in `$ARGUMENTS`, use it.
2. Else default to `http://127.0.0.1:4096`.
3. Confirm the server is alive before using it:
   `curl -sS --max-time 3 <BASE_URL>/global/health` must return
   `{"healthy":true,...}`. If it does not respond, go STRAIGHT to Option D
   (copyable block) — do NOT fall back to a terminal launcher.

`opencode web` runs ONE server with a SINGLE working directory — the API
`POST /session` accepts only `{ parentID?, title? }` and has NO worktree/cwd
parameter. Therefore each web session runs in the SERVER's cwd, and the ticket's
worktree is passed as CONTEXT inside the `/jira-feed` command (not as process
isolation). The worktrees are still created (steps 3–4b) and referenced by path.

For EACH ticket:

```
# 1. Create a session titled with the ticket (capture the returned id).
#    Honor basic auth if OPENCODE_SERVER_PASSWORD is set
#    (user defaults to "opencode", or OPENCODE_SERVER_USERNAME).
sid=$(curl -sS -u "${OPENCODE_SERVER_USERNAME:-opencode}:$OPENCODE_SERVER_PASSWORD" \
      -X POST "<BASE_URL>/session" \
      -H 'Content-Type: application/json' \
      -d '{"title":"<TICKET> — <TITLE>"}' \
      | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).id))')

# 2. Dispatch /jira-feed into that session WITHOUT blocking, via prompt_async.
#    Send the slash-command AS TEXT (leading "/" IS interpreted as a slash-command);
#    include the worktree path as context so the run targets the ticket's worktree
#    despite the shared cwd. prompt_async returns 204 immediately (fire-and-forget);
#    do NOT use /command here — it runs SYNCHRONOUSLY and holds the connection open
#    until the whole /jira-feed finishes.
curl -sS -u "${OPENCODE_SERVER_USERNAME:-opencode}:$OPENCODE_SERVER_PASSWORD" \
     -X POST "<BASE_URL>/session/$sid/prompt_async" \
     -H 'Content-Type: application/json' \
     -d '{"parts":[{"type":"text","text":"/jira-feed <TICKET> --target=tlc (worktree: <WORKTREE_PATH>)"}]}'
```

- Endpoint paths use `{sessionID}` (e.g. `/session/$sid/prompt_async`).
- Omit the `-u` flag when `OPENCODE_SERVER_PASSWORD` is not set (unsecured local
  server).
- The command does NOT open or focus browser tabs. Creating a session emits a
  `session.created` event on the SSE bus (`/event`), so the session appears in
  the web homepage list and runs there — but the UI does not auto-open its tab.
  The server DOES accept a "navigate to session" stimulus
  (`POST /tui/select-session` or `POST /tui/publish` with a
  `tui.session.select` event, both publish `tui.session.select` on the bus), but
  this command deliberately does NOT publish it: with multiple tickets it would
  make the UI jump to a single session. Instead, the final output lists the
  server URL + session ids and tells the user to open each tab from the homepage.
- Store `{TICKET, sessionID, WORKTREE_PATH}` for each ticket.
- `prompt_async` returning 204 confirms the dispatch was accepted. If instead it
  returns 400/404 (or the create call fails), go STRAIGHT to Option D (copyable
  block) — the user is in the web, so do NOT fall back to Herdr/tmux.

#### Option B — Herdr: one pane per ticket, split to the right

Herdr (https://herdr.dev/) is an agent multiplexer with a scriptable CLI. Use it
when `command -v herdr` succeeds AND we are inside a Herdr-managed pane
(`$HERDR_ENV` = `1`, which also gives us `$HERDR_PANE_ID`). For EACH ticket, open
a NEW pane to the RIGHT of the current one, in that ticket's worktree, and run
`/jira-feed` there. `herdr pane split` prints JSON exposing the new pane id at
`.result.pane.pane_id`; `herdr pane run` submits the command + Enter atomically:

```
# For each ticket, split the CURRENT pane to the right, into the worktree cwd.
# Parse .result.pane.pane_id from the JSON (e.g. with node/jq).
pid=$(herdr pane split --current --direction right --cwd "<WORKTREE_PATH>" \
      | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).result.pane.pane_id))')
herdr pane run "$pid" 'opencode --prompt "/jira-feed <TICKET> --target=tlc"'
```

- After the first split you may keep splitting `--current` (each new pane becomes
  a fresh split target) or split the same reference pane; either way each ticket
  lands in its own pane to the right.
- `herdr pane run` launches the OpenCode TUI in that pane's worktree with the
  `/jira-feed` slash-command already dispatched — no manual Enter needed.
- If any `herdr` call fails, fall back to Option C (tmux), then to the copyable
  block.
- Caveat: with many tickets the panes become narrow. This is expected — the
  copyable block below always remains the reliable alternative.

#### Option C — tmux: one window with side-by-side panes

Use tmux ONLY if `command -v tmux` succeeds AND the `TMUX` environment variable
is set (i.e. this session is already inside a tmux server). Open ONE dedicated
window and place every ticket as a PANE inside it, split side-by-side
(ticket1 | ticket2 | ...). For each pane, `cd` is handled by `-c "<WORKTREE_PATH>"`
and the command is sent AND executed (Enter is sent via `C-m`). Capture each
pane's id and target `send-keys` at that exact pane (never rely on the "active"
pane, which shifts as splits are added):
  ```
  # First ticket: create the window, capture the first pane's id
  p1=$(tmux new-window -P -F '#{pane_id}' -n "start-work-on" -c "<WORKTREE_1>")
  tmux send-keys -t "$p1" 'opencode --prompt "/jira-feed <TICKET_1> --target=tlc"' C-m

  # Each remaining ticket: split side-by-side (-h), capture the NEW pane id
  p2=$(tmux split-window -h -P -F '#{pane_id}' -t "$p1" -c "<WORKTREE_2>")
  tmux send-keys -t "$p2" 'opencode --prompt "/jira-feed <TICKET_2> --target=tlc"' C-m
  tmux select-layout -t "$p1" even-horizontal   # keep panes side-by-side, evenly sized
  # ...repeat split-window -h (-t any pane of the window) + send-keys -t <new pane> ... C-m
  #    + select-layout even-horizontal for each further ticket
  ```
  `split-window -h` creates a vertical divider so panes sit side-by-side
  (ticket1 | ticket2). The trailing `C-m` on each `send-keys` submits the command,
  so `opencode --prompt "..."` launches immediately in each pane's worktree with
  the `/jira-feed` prompt already dispatched — no manual Enter needed. Re-run
  `tmux select-layout ... even-horizontal` after each split so the columns stay
  evenly sized as more are added.
- If any `tmux` call fails, fall back to the copyable block for that ticket.
- Caveat: with many tickets the side-by-side columns become narrow. This is
  expected — the copyable block below always remains as the reliable alternative.

#### Option D — copyable block (always available)

When no launcher is usable (no web server, not in a Herdr pane, no tmux, or
`opencode` is not on PATH), emit the copyable block from <output-format> so the
user runs each step manually.

### 6. Aggregate and emit the output

When all tickets have been processed, emit the block described in
<output-format>. For each `Ready` ticket show `cd <WORKTREE_PATH>` followed by
`/jira-feed <TICKET> --target=tlc`. For `Blocked` tickets show the reason.
If a launcher opened targets (web sessions, Herdr or tmux panes), also list them
and note that `/jira-feed` was dispatched to each.
</process>

<output-format>
## Final output format

```
Worktrees ready. Next step per ticket
(run each INSIDE the indicated worktree):

# <TICKET>  — <TITLE>
cd <WORKTREE_PATH>
/jira-feed <TICKET> --target=tlc

# <TICKET>  — <TITLE>
cd <WORKTREE_PATH>
/jira-feed <TICKET> --target=tlc
```

- The result must be a single executable/pasteable block per ticket: `cd` into
  the worktree, then run `/jira-feed <TICKET> --target=tlc` (which fetches the
  full ticket, analyzes the codebase, researches docs, builds the SEED, and hands
  off to `/tlc-specify`).

When a launcher opened targets, add (opencode web — one session/tab per ticket):

```
Opened opencode web sessions — /jira-feed was dispatched to each and is
ALREADY RUNNING. The web UI does not auto-open the tabs; go to the homepage
("Início"/Home) to find them and click each to open its tab:
Server: <BASE_URL>
- <TICKET> → session <sessionID> (worktree: <WORKTREE_PATH>)
- <TICKET> → session <sessionID> (worktree: <WORKTREE_PATH>)

Note: web sessions share the server's working directory; each /jira-feed
received its worktree path as context (logical isolation, not a per-process cwd).
```

or (Herdr — one pane per ticket, split right):

```
Opened Herdr panes (split to the right) — /jira-feed is already running in each:
- <TICKET> → pane <pane_id> (cwd: <WORKTREE_PATH>)
- <TICKET> → pane <pane_id> (cwd: <WORKTREE_PATH>)
```

or (tmux — one window with side-by-side panes):

```
Opened one tmux window ("start-work-on") with side-by-side panes (ticket1 |
ticket2 | ...) — /jira-feed is already running in each pane:
- <TICKET> → pane (cwd: <WORKTREE_PATH>)
- <TICKET> → pane (cwd: <WORKTREE_PATH>)
```

For blocked tickets:

```
# <TICKET>  (BLOCKED)
# Reason: <reason>  — fix it and re-run: /start-work-on <TICKET>
```

Close with a short reminder: worktree branches are local and are only pushed
(push + draft PR) when the feature is complete and you run `/delivery
<BRANCH_NAME>` — the final step of the pipeline. The `/jira-feed` step will show
the exact `/tlc-specify "<seed>"` command and let you authorize it (it never
auto-runs specify).
</output-format>

<constraints>
- This command ONLY prepares: it fetches ONLY the title (summary) of each ticket
  from JIRA to name the worktree, creates the worktree, and points to the next
  command. It does NOT fetch the full ticket, does NOT analyze the codebase, and
  does NOT write any spec — that is `/jira-feed`'s job, later, inside the worktree.
- `PRODUCT_REPO_ROOT` MUST be the product code repository, NEVER the skill repo
  (`ia-framework`). If the CWD is the skill repo or is not git, ASK the user for
  the path — never create worktrees relative to `ia-framework`.
- Worktrees are created SEQUENTIALLY (never in parallel) under
  `<PRODUCT_REPO_ROOT>/../worktrees/`.
- The helper is ALWAYS invoked with `--repo "<PRODUCT_REPO_ROOT>"` to target
  creation at the right repo, regardless of the CWD.
- The description passed to the helper is the ticket TITLE (never the ticket key),
  to avoid the duplicated slug `<TICKET>-<ticket-key>`.
- When the argument has a ticket key, it is ALWAYS the prefix of the worktree/branch
  (never sequential numbering).
- If the ticket TITLE cannot be obtained from JIRA, the ticket is Blocked and no
  worktree is created for it.
- The next command is ALWAYS `/jira-feed <TICKET> --target=tlc`. This command
  never runs `/jira-feed` or `/tlc-specify` in the CURRENT session; launchers
  only dispatch it to SEPARATE targets (web sessions, or `opencode` in separate
  panes/worktrees).
- Launcher preference is opencode web → Herdr → tmux → copyable block; pick the
  first whose preconditions hold and fall back on failure. In every launcher path
  `opencode` MUST be on PATH, otherwise use the copyable block.
- opencode web is used ONLY when the user OPTED IN by exporting `OPENCODE_WEB`
  (truthy: `true`/`1`) before starting the server (e.g.
  `export OPENCODE_WEB=true && opencode web`). There is NO opencode-set env var
  for the web mode, and the launcher MUST NOT probe ports to auto-select web —
  without `OPENCODE_WEB` it skips straight to Herdr, even if a server is
  listening. When `OPENCODE_WEB` is set, resolve the base URL from `--web-url=<base>`
  or default `http://127.0.0.1:4096`, and confirm it with
  `GET <BASE_URL>/global/health` before use. Once the web context is chosen it is
  COMMITTED: any failure (health check, session create, or dispatch) goes STRAIGHT
  to the copyable block — NEVER to Herdr/tmux, since the user is in the web and
  not in a terminal multiplexer. It then uses the server API: `POST /session`
  (`{ title }`) to create one session per ticket, then
  `POST /session/{sessionID}/prompt_async` with
  `{ parts: [{ type: "text", text: "/jira-feed <TICKET> --target=tlc (worktree: ...)" }] }`
  to dispatch WITHOUT blocking (returns 204; the leading `/` is interpreted as a
  slash-command). It MUST NOT use `POST /session/:id/command` for this — that
  endpoint runs synchronously and holds the connection open until `/jira-feed`
  finishes. Basic auth
  (`OPENCODE_SERVER_PASSWORD`, user `OPENCODE_SERVER_USERNAME` defaulting to
  `opencode`) is honored when set. The server has a SINGLE cwd and `POST /session`
  has NO worktree parameter, so each session runs in the server's cwd and the
  ticket's worktree is passed as CONTEXT in the `/jira-feed` arguments (logical
  isolation, not per-process cwd). No browser tab is opened automatically; the
  output lists the server URL + session ids for the user to open tabs from the
  web homepage.
- Herdr is used ONLY when `herdr` is installed AND we run inside a Herdr pane
  (`$HERDR_ENV=1`); each ticket gets its own pane split to the RIGHT
  (`herdr pane split --current --direction right --cwd <WORKTREE>`), then
  `herdr pane run <pane_id> 'opencode --prompt "/jira-feed <TICKET> --target=tlc"'`.
- tmux is used ONLY when `tmux` is installed, `$TMUX` is set, and `opencode` is on
  PATH; all tickets are opened as split panes side-by-side (`split-window -h`,
  even-horizontal) in a SINGLE window, and the command is executed immediately in
  each pane (Enter is sent via `C-m`).
- No push happens here — the branch is local until /delivery.
</constraints>
