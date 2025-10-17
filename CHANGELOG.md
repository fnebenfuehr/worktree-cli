# worktree-cli

## 1.1.0

### Minor Changes

- 357032b: Add MCP (Model Context Protocol) server support

  - New `worktree mcp start` command to run as MCP server
  - New `worktree mcp config` command to show AI assistant configuration
  - New `worktree mcp test` command to verify server functionality
  - Expose all worktree operations as MCP tools for AI assistants

### Patch Changes

- d2a9f3d: Fix hook command execution failing due to improper argument parsing. Hook commands with arguments (e.g., "bun install") now execute correctly via platform-specific shell wrapper (sh -c on Unix, cmd /c on Windows). Includes improved error messages with shell context.
- ef0366f: Replace update-notifier with lightweight implementation, reducing bundle size by ~400KB (~10%). Update checks are now non-blocking and more robust.

## 1.0.0

### Major Changes

- cef2cf1: Initial release of worktree-cli

  A modern CLI tool for managing git worktrees with ease. Key features:

  - **Clone & Setup**: Clone repos into worktree-ready structure or convert existing repos
  - **Branch Management**: Create, remove, switch, and list worktrees with intuitive commands
  - **Lifecycle Hooks**: Automate setup/teardown with configurable post-create, pre-remove, and post-remove hooks
  - **File Management**: Automatically copy files (env files, configs) to new worktrees
  - **Safety First**: Prevents accidental removal of active worktrees
  - **Smart Defaults**: Auto-detects default branches and handles edge cases

  Commands:

  - `worktree clone <git-url>` - Clone repo into worktree structure
  - `worktree setup` - Convert existing repo to worktrees
  - `worktree create <branch>` - Create new worktree and branch
  - `worktree remove <branch>` - Remove worktree
  - `worktree switch [branch]` - Switch to worktree (interactive if no branch)
  - `worktree list` - List all worktrees
