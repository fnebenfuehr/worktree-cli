# Worktree Lifecycle Hooks

Configure automated setup and teardown for your worktrees using lifecycle hooks.

## Security Warning

⚠️ **Config files execute shell commands with your user permissions.** Always review `.worktreerc` files in repositories before creating worktrees, especially in projects from untrusted sources.

Like `npm install` or `Makefile`, worktree hooks execute arbitrary commands. Treat config files from cloned repositories with the same caution you would apply to any executable code.

## Quick Start

Create a `.worktreerc` file in your project root:

```json
{
  "post_create": ["bun install"],
  "copy_files": [".env"]
}
```

Now when you create a worktree, dependencies install automatically and `.env` is copied.

## Configuration

### Supported Formats

- `.worktreerc` (JSON or YAML)
- `.worktreerc.json`
- `.worktreerc.yaml` / `.worktreerc.yml`
- `.worktree.yml`
- `worktree.config.js` / `worktree.config.cjs`

### Available Hooks

#### `post_create` (string[])
Commands run **after** creating a worktree. Executed in the new worktree directory.

#### `pre_remove` (string[])
Commands run **before** removing a worktree. Executed in the worktree being removed.

#### `post_remove` (string[])
Commands run **after** removing a worktree. Executed in the main worktree directory.

#### `copy_files` (string[])
Files/directories to copy from main worktree. Full paths preserved (e.g., `apps/web/.env`).

## Examples

### Basic Node.js Project

**.worktreerc**
```json
{
  "post_create": ["npm install"],
  "copy_files": [".env"]
}
```

### Monorepo with Multiple Env Files

**.worktree.yml**
```yaml
post_create:
  - bun install

copy_files:
  - .env
  - apps/web/.env.local
  - apps/api/.env.local
```

### Python Project

**.worktreerc**
```json
{
  "post_create": [
    "python -m venv venv",
    "source venv/bin/activate && pip install -r requirements.txt"
  ],
  "copy_files": [".env"]
}
```

### Using Package.json Scripts

Delegate complexity to your existing scripts:

**.worktreerc**
```json
{
  "post_create": ["npm run worktree:setup"],
  "pre_remove": ["npm run worktree:cleanup"]
}
```

**package.json**
```json
{
  "scripts": {
    "worktree:setup": "npm install && npm run db:migrate",
    "worktree:cleanup": "docker compose down"
  }
}
```

### Docker with Database

**.worktreerc**
```json
{
  "post_create": [
    "docker compose up -d --wait",
    "npm install",
    "npm run db:migrate"
  ],
  "pre_remove": ["docker compose down"],
  "copy_files": [".env", "docker-compose.override.yml"]
}
```

**Note**: Use `--wait` flag to ensure services are ready before continuing.

### Dynamic Configuration

**worktree.config.js**
```javascript
module.exports = {
  post_create: [
    'npm install',
    process.env.CI ? 'npm test' : 'npm run dev:setup'
  ],
  copy_files: ['.env']
};
```

## CLI Flags

### `--no-hooks`
Skip running all lifecycle hooks:
```bash
worktree create feature/test --no-hooks
worktree remove feature/test --no-hooks
```

### `--verbose`
Show detailed output including command results:
```bash
worktree create feature/test --verbose
```

## How It Works

- Commands run **sequentially** in the order listed
- Failed commands show a warning but don't stop execution
- Hooks are optional (no config = no hooks)
- Config loaded from main worktree root (where `.git` lives)

## Best Practices

1. **Keep hooks simple** - Delegate complex logic to npm/bun scripts
2. **Use --wait for services** - Docker/DB services need time to start
3. **Test with --verbose** - See exactly what's happening
4. **Fail gracefully** - Don't assume hooks always succeed

## Troubleshooting

**Hooks not running?**
- Check config file is in main worktree root
- Validate JSON/YAML syntax
- Use `--verbose` to see what's happening

**Command fails but doesn't stop?**
- By design - hooks warn but continue
- Critical failures should be in your CI, not hooks

**Need to skip hooks temporarily?**
- Use `--no-hooks` flag
