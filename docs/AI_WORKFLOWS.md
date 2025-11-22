# AI Coding Workflows

Common patterns for using worktrees with AI coding assistants.

## Parallel Feature Development

Work on related features in separate worktrees without conflicts.

```
project/
├── main/
├── feat-auth/        # Session 1: authentication
├── feat-dashboard/   # Session 2: dashboard UI
└── feat-api/         # Session 3: API endpoints
```

**Claude Code:**
> "Create a worktree for the authentication feature"

Each session has complete isolation. No merge conflicts until you're ready.

## PR Review Workflow

Review PRs without disrupting current work.

```bash
# You're working on a feature
worktree pr 123
# Review the PR in its own worktree
# Switch back when done
worktree switch feat/my-feature
```

**Claude Code:**
> "Checkout PR #123 for review"

Claude fetches PR info and creates a worktree automatically.

## Bug Hotfix

Quick fixes without losing context.

```bash
# Working on a feature, urgent bug reported
worktree create fix/critical-bug
# Fix, commit, push
# Return to feature work
worktree switch feat/my-feature
```

Your feature work remains untouched.

## Experimentation

Try risky changes safely.

```bash
worktree create experiment/new-architecture
# Try radical changes
# If it works: merge
# If not: worktree remove experiment/new-architecture
```

No impact on main development.

## Multi-Agent Workflow

Different AI sessions in different worktrees.

**Session 1 (Claude Code):** Frontend work in `feat-ui`
**Session 2 (Cursor):** Backend work in `feat-api`
**Session 3 (Claude Code):** Tests in `feat-tests`

Each agent has its own context. No stepping on each other's changes.

## Best Practices

1. **One task per worktree** - Keep contexts clean
2. **Use conventional branch names** - `feat/`, `fix/`, `chore/`
3. **Clean up after merge** - `worktree remove` merged branches
4. **Configure hooks** - Auto-install deps, copy .env files
5. **Let AI manage worktrees** - MCP tools handle the complexity

## MCP Tool Selection

| Task | Tool |
|------|------|
| Start new work | `worktree_status` → `worktree_create` |
| Continue existing | `worktree_list` → `worktree_switch` |
| Review PR | `worktree_pr` |
| Existing branch | `worktree_checkout` |
| Done with work | `worktree_remove` |
