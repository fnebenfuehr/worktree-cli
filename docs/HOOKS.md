# Lifecycle Hooks

Automate worktree setup and teardown.

## Configuration

Create `.worktree.json` in your project root:

```json
{
  "defaultBranch": "main",
  "post_create": ["npm install"],
  "pre_remove": ["docker compose down"],
  "copy_files": [".env", ".env.local"]
}
```

## Hooks

| Hook | When | Working Directory |
|------|------|-------------------|
| `post_create` | After creating worktree | New worktree |
| `pre_remove` | Before removing worktree | Worktree being removed |
| `post_remove` | After removing worktree | Main worktree |

`copy_files` copies files from main worktree to new worktree.

## Environment Variables

Hooks receive context via environment variables:

| Variable | Description |
|----------|-------------|
| `WORKTREE_PATH` | Path to the worktree |
| `WORKTREE_BRANCH` | Branch name |
| `WORKTREE_MAIN_PATH` | Path to main worktree |
| `WORKTREE_PROJECT` | Project name |

## Examples

### Node.js

```json
{
  "post_create": ["npm install"],
  "copy_files": [".env"]
}
```

### Monorepo

```json
{
  "post_create": ["bun install"],
  "copy_files": [".env", "apps/web/.env.local", "apps/api/.env.local"]
}
```

### Docker + Database

```json
{
  "post_create": [
    "docker compose up -d --wait",
    "npm install",
    "npm run db:migrate"
  ],
  "pre_remove": ["docker compose down"],
  "copy_files": [".env"]
}
```

### Delegate to npm scripts

```json
{
  "post_create": ["npm run worktree:setup"],
  "pre_remove": ["npm run worktree:cleanup"]
}
```

## CLI Flags

| Flag | Description |
|------|-------------|
| `--no-hooks` | Skip all hooks |
| `--trust-hooks` | Skip security validation |
| `--verbose` | Show detailed output |

## Security

Hooks execute shell commands with your user permissions.

**Review `.worktree.json` in untrusted repositories before creating worktrees.**

Dangerous patterns are blocked by default:
- `rm -rf` (except safe paths like node_modules)
- `curl | bash`, `wget | bash`
- `sudo`, `eval`

Use `--trust-hooks` to bypass validation.

## Behavior

- Commands run sequentially in order listed
- Failed commands warn but don't stop execution
- Config loaded from main worktree root
