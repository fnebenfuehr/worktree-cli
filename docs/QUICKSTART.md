# Quick Start

Get up and running in 2 minutes.

## Prerequisites

- Git 2.5+
- Node.js 18+ or Bun 1.0+
- GitHub CLI (`gh`) for PR checkout feature

## Install

```bash
npm install -g @fnebenfuehr/worktree-cli
# or
bun install -g @fnebenfuehr/worktree-cli
```

## Setup Worktrees

### New Repository

```bash
worktree clone git@github.com:user/repo.git
cd repo/main
```

### Existing Repository

```bash
cd your-project
worktree setup
cd main
```

## Create Your First Worktree

```bash
worktree create feat/my-feature
cd ../feat-my-feature
```

## Configure MCP for Claude Code

Add to `~/.config/claude/mcp_settings.json`:

```json
{
  "mcpServers": {
    "worktree": {
      "command": "npx",
      "args": ["-y", "@fnebenfuehr/worktree-cli", "mcp"]
    }
  }
}
```

Restart Claude Code.

## First AI-Assisted Worktree

In Claude Code, try:

> "Create a worktree for adding dark mode"

Claude will use `worktree_create` to set up an isolated workspace.

## Next Steps

- Add hooks to `.worktree.json` for auto-setup (npm install, etc.)
- See [AI_WORKFLOWS.md](./AI_WORKFLOWS.md) for common patterns
