# worktree-cli

## 1.5.0

### Minor Changes

- f725a59: Add `worktree pr` command to checkout PRs by number or GitHub URL
- 830b9f0: Add `worktree update` command to update CLI to the latest version
- ad3c6d8: Add security validation for hook commands before execution. Blocks dangerous patterns (curl|sh, sudo, eval, unsafe rm -rf) and prompts for confirmation on unrecognized commands. Use --trust-hooks to bypass validation.

### Patch Changes

- 8954bd7: Fix worktree detection to use config file instead of checking worktrees directory

## 1.4.0

### Minor Changes

- 9adea98: Add worktree_checkout command with intelligent branch detection. Automatically discovers branches locally or on remote and creates appropriate worktrees. Switches to existing worktree if branch already checked out. Sets upstream tracking for remote branches.
- de2a259: Add JSON schema for configuration file validation and IDE autocomplete support

### Patch Changes

- 79f78a9: Add validation to require worktree structure before creating new worktrees
- 555c677: Fix getGitCommonDir to work from parent worktree folder by adding fallback to find git repos in subdirectories, prioritizing default branch worktree.
- 6ed7edc: Fix MCP status detection to work correctly from any worktree directory. Now properly identifies main worktree and default branch regardless of current working directory.

## 1.3.0

### Minor Changes

- c996e00: Add ability to create worktrees from any branch using --from flag. When in non-main branch, user is prompted to choose base branch (current or main). Success message now shows base branch. Updated examples to use conventional commit style (feat/_, fix/_).
- 0916008: Enhance MCP tool descriptions for intelligent worktree management. Improves AI assistant's ability to decide when to create new worktrees vs reuse existing ones based on task context and relationship to current work. Adds smart workflow guidance for agentic coding tools.

### Patch Changes

- 690624a: Fix merge detection to correctly check if branch is merged locally. Previously used `git branch --merged` which showed branches that are ancestors of target (opposite behavior). Now uses `git merge-base --is-ancestor` to properly detect if branch commits are reachable from target branch, regardless of push status.
- a63d4b5: fix: post_remove hook now runs in main worktree directory instead of current worktree

## 1.2.0

### Minor Changes

- c0c180b: Add comprehensive safety checks for worktree removal with new --force flag. Fixes process.cwd() error when removing current worktree. Now prevents removal if uncommitted changes exist or branch is unmerged (interactive mode prompts for confirmation, non-interactive mode errors). Use --force to bypass all safety checks. Improved error handling for better error visibility.

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
