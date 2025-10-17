# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A modern CLI tool for managing git worktrees, built with Bun and TypeScript. Provides commands to clone repos, setup worktrees, create/remove/switch branches, with lifecycle hooks for automation.

## Development Commands

```bash
# Run CLI locally
bun run dev

# Build for production
bun run build

# Type checking
bun run typecheck

# Linting and formatting
bun run lint         # Check issues
bun run lint:fix     # Fix issues
bun run format       # Format code

# Testing
bun test                    # Run all tests
bun test path/to/test.ts    # Run specific test

# Full check (format + typecheck)
bun run check

# Release workflow
bun run changeset    # Create changeset (only command needed manually)
```

## Architecture

### Entry Point (`src/index.ts`)
- Commander.js-based CLI with 6 commands: clone, setup, create, remove, switch, list
- Global error handling via `handleCommandError` wrapper
- All commands return exit codes (0 = success, >0 = error)
- `UserCancelledError` = silent exit, `WorktreeError` = logged error
- Update notifier checks for new versions (once per day)

### Commands (`src/commands/*.ts`)
Each command is a standalone function returning `Promise<number>` (exit code):
- **clone**: Clone repo into worktree structure (`my-repo/main/`)
- **setup**: Convert existing repo to worktree structure
- **create**: Create new worktree + branch, run post_create hooks, copy files
- **remove**: Remove worktree, run pre_remove + post_remove hooks
- **switch**: Interactive/direct worktree switching (outputs cd command)
- **list**: Display all worktrees with icons (⚡ main, ➜ current, 📦 others)

### Configuration System (`src/config/loader.ts`)
- Uses cosmiconfig to load `.worktreerc`, `.worktreerc.json`, `.worktree.yml`, etc.
- Schema: `post_create`, `pre_remove`, `post_remove` (string[]), `copy_files` (string[])
- Always loaded from main worktree root (where `.git` lives)
- Invalid configs are silently skipped with warning

### Hook Execution (`src/hooks/executor.ts`)
- Hooks run sequentially via Bun's `$` shell
- Failed hooks log warning but continue execution
- Respects `--no-hooks` flag and `skipHooks` option
- `post_create`: runs in new worktree dir
- `pre_remove`: runs in worktree being removed
- `post_remove`: runs in main worktree dir

### Git Utilities (`src/utils/git.ts`)
Core functions wrapping git commands:
- `execGit`: Execute git with error handling
- `getGitRoot`, `findGitRootOrThrow`: Find repo root
- `getCurrentBranch`, `getDefaultBranch`: Branch detection
- `branchExists`, `createBranch`: Branch operations
- `getWorktreeList`: Parse `git worktree list` output
- `addWorktree`, `removeWorktree`: Worktree management

### Error Handling (`src/utils/errors.ts`)
Custom error classes extending `WorktreeError`:
- `ValidationError`: User input issues (exit 1)
- `GitError`: Git command failures (exit 1)
- `UserCancelledError`: User cancelled action (exit 0)

### File Operations (`src/utils/file-operations.ts`)
- `copyFiles`: Copy files from main worktree preserving paths
- Handles both files and directories
- Used by create command with `copy_files` config

### User Interface (`src/utils/prompts.ts`)
- Wrappers around `@clack/prompts` for consistent UX
- `log.message`, `log.error`, `log.warn`, `log.success`
- `spinner`: Progress indicators for long operations
- Interactive prompts: `confirm`, `selectBranch`, `textInput`

## Key Behaviors

### Branch Name Conversion
Slashes in branch names become dashes in directory names:
- `feature/login` → `../feature-login/`

### Worktree Structure
```
my-repo/
├── main/              # Main worktree (bare repo location)
│   ├── .git/
│   └── src/
├── feature-login/     # Feature worktree
└── bugfix-123/        # Bug fix worktree
```

### Hook Execution Context
- `post_create`: Runs in newly created worktree directory
- `pre_remove`: Runs in worktree being removed (before deletion)
- `post_remove`: Runs in main worktree directory (after deletion)

### Safety Features
- Cannot remove main worktree (first worktree in list)
- Git validation before worktree operations
- Graceful hook failures (warn but continue)

## Testing

Tests use Bun's built-in test runner. Key test files:
- `cli.test.ts`: CLI argument parsing and command routing
- `commands.test.ts`: Command logic and integration
- `config.test.ts`: Config loading and validation
- `git.test.ts`: Git utility functions
- `errors.test.ts`: Error handling behavior

Run specific test: `bun test tests/git.test.ts`

## Tools & Dependencies

- **Runtime**: Bun (required, specified in engines)
- **CLI Framework**: Commander.js for arg parsing
- **Config**: cosmiconfig for flexible config loading
- **UI**: @clack/prompts for interactive prompts
- **Linter**: Biome for linting and formatting
- **Git Hooks**: Lefthook for pre-commit hooks
- **Versioning**: Changesets for release management

## Release Process

Fully automated via changesets/action workflow:

1. Make changes and commit
2. `bun run changeset` - document changes (creates file in `.changeset/`)
3. Push to main
4. CI automatically creates/updates "Version Packages" PR with version bumps + CHANGELOG
5. Merge the PR
6. CI automatically publishes to npm with provenance

**Note**: Never manually run `bun run version` or `bun run release` - CI handles this.
