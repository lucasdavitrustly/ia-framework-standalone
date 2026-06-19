# Session Tokens & Identity — OpenCode SQLite source

Both capture commands (`/mcp-bench-run`, `/mcp-bench-baseline`) read the **real**
session token usage and the active model/provider directly from OpenCode's local
SQLite database. This replaces unreliable self-introspection.

This is a **read-only convenience source** for the *current run's* metrics. It
does NOT change the statelessness rule: report files are still the single source
of truth and are derived from a live `glob` of `mcp-bench-reports/`. The DB is
consulted only for live token/identity figures of the in-progress session.

## Database location

```
~/.local/share/opencode/opencode.db
```

SQLite, written by OpenCode (Drizzle ORM). Tables of interest: `session`,
`message`.

- `session` columns (top-level, not JSON): `id`, `directory`, `title`,
  `time_created`, `time_updated`.
- `message.data` is a JSON blob. **Assistant** messages contain:
  `tokens.input`, `tokens.output`, `tokens.reasoning`, `tokens.cache.read`,
  `tokens.cache.write`, `cost`, `modelID`, `providerID`, `mode`, `agent`,
  `path.cwd`, `time.created`.

Note: the DB `cost` field may be `0` for some providers (e.g. AWS Bedrock), so
cost is always recomputed from `model-pricing.json` (input + output only), never
read from the DB.

## Step A — resolve the current session id

The current conversation is the most-recently-updated session whose `directory`
matches the working directory (`<CWD>`):

```bash
SID=$(sqlite3 -readonly ~/.local/share/opencode/opencode.db \
  "SELECT id FROM session WHERE directory='<CWD>' ORDER BY time_updated DESC LIMIT 1;")
```

## Step B — snapshot tokens + identity (run at START and at END)

```bash
sqlite3 -readonly ~/.local/share/opencode/opencode.db \
  "SELECT
     COALESCE(SUM(json_extract(data,'\$.tokens.input')),0),
     COALESCE(SUM(json_extract(data,'\$.tokens.output')),0),
     MAX(json_extract(data,'\$.modelID')),
     MAX(json_extract(data,'\$.providerID'))
   FROM message
   WHERE session_id='$SID'
     AND json_extract(data,'\$.role')='assistant';"
```

Output is pipe-separated: `input_sum|output_sum|modelID|providerID`.

## Step C — compute the DELTA (this run's tokens)

- At `T_START`, capture `IN0`, `OUT0`.
- At `T_END`, capture `IN1`, `OUT1`, plus `MODEL`/`PROVIDER` (end snapshot).
- This run's tokens:
  - `SESSION_INPUT_TOKENS  = IN1 - IN0`
  - `SESSION_OUTPUT_TOKENS = OUT1 - OUT0`

Delta isolates the tokens spent by *this* capture run from prior turns in the
same session.

## Identity

- `MODEL`    = `modelID` from the end snapshot.
- `PROVIDER` = `providerID` from the end snapshot.
- `TEMPERATURE` is **not stored** in the DB → always `unknown`.

If the DB does not yield a model/provider, fall back to the agent's own
self-knowledge; if still unknown, write `unknown`.

## Graceful degradation (never fail the command)

Set `SESSION_INPUT_TOKENS = N/A`, `SESSION_OUTPUT_TOKENS = N/A` (which forces
`cost_usd = "N/A"` + a warning) when ANY of the following hold:

1. `sqlite3` is not on `PATH`.
2. `~/.local/share/opencode/opencode.db` does not exist or is unreadable.
3. The session id cannot be resolved (empty `SID`).
4. The delta is negative or implausible (e.g. `IN1 < IN0`).

## Safety

- ALWAYS use `sqlite3 -readonly`. Never write to the DB.
- Never modify, vacuum, or lock the database.
