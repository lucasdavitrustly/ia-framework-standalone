---
name: delivery
description: >
  Finalize a feature developed in a worktree. Verifies the GitHub CLI (gh) is
  authenticated, pushes branches to both repos (current + fi-connectors), fetches
  Jira ticket info for the PR title, and creates a Draft Pull Request. If gh is not
  authenticated it waits for the user to authenticate or aborts cleanly. Run this
  when the feature is complete.
argument-hint: "[worktree-path or feature-num]"
tools:
  read: true
  write: true
  edit: true
  bash: true
  glob: true
  grep: true
---

<objective>
Deliver a completed feature from a git worktree: verify `gh` is authenticated,
push the branch to both the current repo and fi-connectors, fetch the Jira ticket
title, and create a Draft Pull Request with the standard body template. The
delivery is only complete when the PR exists — if `gh` is not authenticated, wait
for the user to authenticate and continue, or abort cleanly so they can re-run
`/delivery`.
</objective>

<process>
1. **Identify the worktree**:
   - If `$ARGUMENTS` is provided, use it as the worktree path or feature number.
   - Otherwise, list worktrees under `<repo-root>/../worktrees/` and ask the
     user which one to deliver.
   - The branch name matches the worktree directory name (e.g.,
     `DEV-277503-expected-effective-datetime`).

2. **Pre-delivery checks**:
   - `cd` into the worktree directory.
   - Verify there are no uncommitted changes (`git status --porcelain` must be
     empty). If dirty, ask the user whether to commit or stash before proceeding.
   - Verify the branch has commits ahead of the base branch. Use the GitHub
     default branch resolved in step 3b as the base (e.g. `origin/<default>`) —
     NEVER assume the local checkout's upstream (e.g. `master`) is the base.
   - Show a summary: branch name, number of commits ahead, files changed.

3. **Verify `gh` CLI authentication (MANDATORY — before any push)**:
   - The PR step REQUIRES the GitHub CLI. Confirm it is installed and authenticated
     BEFORE pushing anything, so a partial delivery (branches pushed, PR missing)
     never happens.
   - Check installation: `command -v gh`. If missing, STOP — tell the user to
     install `gh` and re-run `/delivery`. Do not push.
   - Check authentication: `gh auth status`. If it exits non-zero (not
     authenticated), STOP and present the user exactly TWO choices:
     1. **Authenticate now, then continue** — instruct them to run `gh auth login`
        (or `gh auth login --hostname <host>` for GitHub Enterprise) in their
        terminal. WAIT for them to confirm completion, then re-run `gh auth status`
        to verify. Only proceed once it passes. Never write, cache, or ask for
        tokens/credentials yourself.
     2. **Abort** — stop the delivery cleanly with NO side effects (no pushes, no
        branch creation in fi-connectors, no PR). Tell the user they can re-run
        `/delivery` after authenticating.
   - Do NOT proceed to step 4 (push) until `gh auth status` succeeds or the user
     chose to abort.

3b. **Resolve the base branch from GitHub (AUTHORITATIVE — never infer locally)**:
   - The PR base MUST be the repository's default branch as reported by GitHub,
     NOT inferred from the local worktree's history/upstream. A worktree created
     off `master` does not mean `master` is the repo default (it may be `main`,
     `develop`, etc.), and picking the wrong base produces a broken or huge diff.
   - Resolve it from the current repo (run from inside the worktree or the repo):
     ```
     BASE_BRANCH=$(gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name')
     ```
   - If `gh repo view` fails or returns empty, STOP and ask the user for the base
     branch — do NOT fall back to guessing from local branches. Only after the user
     confirms should you proceed.
   - Use this `BASE_BRANCH` for BOTH the "commits ahead" check (step 2) and the
     PR `--base` (step 6). If fi-connectors is a separate GitHub repo, resolve its
     default branch the same way (`gh repo view <owner/repo> --json defaultBranchRef`)
     rather than reusing the current repo's default.

4. **Push branches to both repos**:
   - **Current repo**: `git push -u origin <branch-name>` from the worktree.
   - **fi-connectors**: Create a branch with the SAME name in the fi-connectors
     repository (sibling repo at `<repo-root>/../fi-connectors`) and push it:
     ```
     cd <repo-root>/../fi-connectors
     git checkout -b <branch-name>   # (or switch to it if it already exists)
     git push -u origin <branch-name>
     ```
   - If either push fails, surface the error and ask how to proceed.

5. **Fetch Jira ticket info**:
   - Extract the ticket key from the branch name. The ticket key is the prefix
     before the slug (e.g., `DEV-277503` from `DEV-277503-expected-effective`).
     Pattern: first match of `[A-Z]+-[0-9]+` in the branch name.
   - Fetch the ticket title from Jira (via MCP `getJiraIssue` with
     `cloudId: "trustly.atlassian.net"`).
   - Compose the PR title: `[<JIRA_KEY>] <Jira ticket title>`
     Example: `[DEV-277503] Propagate Expected Effective Datetime on Resend`

6. **Create Draft Pull Request (MANDATORY — the delivery is not complete without it)**:
   - Re-verify `gh auth status` succeeds (auth may have expired since step 3). If
     it now fails, STOP and re-present the two choices from step 3 (authenticate
     and continue, or abort) — do not silently skip PR creation.
   - Load the PR body template from `references/pr-body-template.md`.
   - Replace placeholders:
     - `{{JIRA_ID}}` → the ticket key (e.g., `DEV-277503`)
     - `{{JIRA_URL}}` → `https://trustly.atlassian.net/browse/<JIRA_KEY>`
   - Create the PR as **Draft** using `gh pr create --draft` with:
     - `--title "[<JIRA_KEY>] <ticket title>"`
     - `--body "<rendered template>"`
     - `--base "$BASE_BRANCH"` — the GitHub default branch resolved in step 3b via
       `gh repo view --json defaultBranchRef`. NEVER hardcode or infer main/master
       from the local checkout.
   - If `gh pr create` fails due to authentication, STOP and offer the two choices
     from step 3. For any other `gh` error, surface the exact error and print the
     ready-to-run `gh pr create ...` command so the user can retry manually.
   - Report the PR URL to the user only after the PR is actually created.

7. **Clean up worktree (optional)**:
   - Only offer cleanup AFTER the PR was successfully created. If delivery was
     aborted at the auth gate (or the PR was not created), do not clean up anything.
   - Ask the user if they want to remove the worktree now.
   - If yes: from the main repo, run `git worktree remove <path>`.
   - Run `git worktree prune` to clean up stale references.
</process>

<constraints>
- The GitHub CLI (`gh`) MUST be installed and authenticated (`gh auth status`
  succeeds) BEFORE any push. If not, either wait for the user to authenticate and
  then continue, or abort cleanly — never do a partial delivery.
- On the auth gate, offer exactly two options: (1) authenticate now and continue,
  or (2) abort so the user can re-run `/delivery`.
- NEVER handle, request, store, or echo GitHub tokens/credentials. Authentication
  is always done by the user via `gh auth login` in their own terminal.
- Aborting at the auth gate MUST leave no side effects: no pushes, no fi-connectors
  branch, no PR, no worktree cleanup.
- The PR is mandatory: a delivery that pushed branches but did not create the PR is
  incomplete. Do not report success or offer cleanup without a created PR.
- NEVER force-push or rebase without explicit user consent.
- NEVER delete the branch itself — only the worktree directory.
- If the worktree has uncommitted work, STOP and ask — never discard changes.
- The PR MUST always be created as Draft (`--draft`).
- The PR title MUST follow the pattern `[<JIRA_KEY>] <ticket title>`.
- The PR body MUST use the template from `references/pr-body-template.md`.
- The PR base branch MUST be resolved from GitHub via
  `gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'` — NEVER
  inferred from the local worktree's history/upstream (a worktree based off
  `master` does not imply the repo default is `master`). If `gh` cannot resolve
  it, ask the user; do not guess.
- Both repos (current AND fi-connectors) MUST have the branch pushed.
- This command works from EITHER the main repo directory OR from inside the
  worktree itself.
</constraints>
