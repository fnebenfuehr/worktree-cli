# Worktree CLI

A modern CLI for managing git worktrees that enables parallel AI coding assistants and simultaneous multi-branch development.

## Why Git Worktrees?

Git worktrees allow you to have multiple working directories for a single repository, making it easy to:

- Work on multiple branches simultaneously without switching contexts
- Isolate AI agent environments for safe parallel development without context conflicts
- Run tests on one branch while developing on another
- Review pull requests without disrupting your current work
- Keep your main branch clean and always deployable

## Features

- **Easy Setup**: Clone repos directly into worktree-ready structure or convert existing repos
- **Simple Workflow**: Create, switch, and manage worktrees with intuitive commands
- **Smart Defaults**: Automatically detects default branches and handles edge cases
- **Lifecycle Hooks**: Automate setup/teardown with configurable post-create, pre-remove, and post-remove hooks
- **File Management**: Copy files from main worktree (env files, configs, etc.)
- **Safety First**: Prevents data loss with uncommitted change detection and unmerged branch warnings
- **AI Integration**: MCP server support - let AI assistants manage worktrees for parallel development

## Installation

### Global Installation (npm)

```bash
npm install -g @fnebenfuehr/worktree-cli
```

### Global Installation (Bun)

```bash
bun install -g @fnebenfuehr/worktree-cli
```

## Usage

### Repository Setup

#### Clone a New Repository

Clone a repository directly into a worktree-ready structure:

```bash
worktree clone git@github.com:user/my-app.git
```

This creates a directory structure like:

```
my-app/
└── main/          # or whatever the default branch is
    ├── .git/
    ├── src/
    └── ...
```

#### Convert Existing Repository

Convert an existing cloned repository to use worktrees:

```bash
cd my-existing-repo
worktree setup
```

This reorganizes your repository into:

```
parent-dir/
└── main/          # your existing clone
    ├── .git/
    ├── src/
    └── ...
```

### Branch Management

#### Create a New Worktree

Create a new worktree for a branch:

```bash
worktree create feature/new-feature
```

This:

1. Creates the branch if it doesn't exist (from `origin/main`)
2. Creates a new worktree directory
3. Copies configured files (if `.worktreerc` exists)
4. Runs post-create hooks (if configured)

Your structure becomes:

```
my-app/
├── main/
└── feature-new-feature/    # slashes converted to dashes
```

#### Switch Between Worktrees

Quickly switch to an existing worktree:

```bash
worktree switch feature/new-feature
# Shows the cd command to navigate to the worktree
```

**Interactive mode:**
```bash
worktree switch
# Shows a list of all worktrees to choose from
```

#### Remove a Worktree

Remove a worktree when you're done:

```bash
worktree remove feature/new-feature
```

#### List All Worktrees

See all active worktrees:

```bash
worktree list
```

## Configuration & Hooks

A `.worktree.json` config file is automatically created when you run `worktree clone` or `worktree setup`. You can also create one manually:

```json
{
  "defaultBranch": "main",
  "post_create": ["bun install"],
  "pre_remove": ["docker compose down"],
  "copy_files": [".env", "apps/web/.env.local"]
}
```

**Configuration options:**
- `defaultBranch` - The default branch name (auto-detected during setup)
- `post_create` - Commands to run after creating a worktree
- `pre_remove` - Commands to run before removing a worktree
- `post_remove` - Commands to run after removing a worktree
- `copy_files` - Files to copy from main worktree when creating new worktrees

**See [docs/hooks.md](./docs/hooks.md) for complete configuration guide and examples.**

## AI Assistant Integration

Enable AI assistants to manage worktrees via MCP:

```bash
worktree mcp config  # Show config for Claude Desktop/Cody/Cursor
worktree mcp test    # Verify setup
```

After adding the config to your AI assistant and restarting, your AI can create isolated worktrees for features, experiments, or parallel work.

## Command Reference

### `worktree clone <git-url>`

Clone a repository into a worktree-ready structure.

**Arguments:**

- `git-url` - The git repository URL (SSH or HTTPS)

**Example:**

```bash
worktree clone git@github.com:vercel/next.js.git
```

### `worktree setup`

Convert an existing git repository to use worktrees.

**Requirements:**

- Must be run from the root of a git repository
- Repository must not already be in worktree structure

**Example:**

```bash
cd my-project
worktree setup
cd main  # your repository is now in the 'main' subdirectory
```

### `worktree create <branch>`

Create a new git worktree and branch.

**Arguments:**

- `branch` - The branch name (can include slashes, e.g., `feature/login`)

**Behavior:**

- Creates the branch from `origin/main` (or detected default branch) if it doesn't exist
- Creates worktree directory with slashes replaced by dashes
- Copies configured files and runs post-create hooks (if configured)

**Options:**
- `-i, --interactive` - Interactive mode with prompts
- `--no-hooks` - Skip running lifecycle hooks

**Example:**

```bash
worktree create feature/user-auth
# Creates: ../feature-user-auth/
```

### `worktree remove <branch>`

Remove an existing git worktree.

**Arguments:**

- `branch` - The branch name to remove

**Behavior:**
- Runs pre-remove hooks before deletion (if configured)
- Removes the worktree and cleans up git references
- Runs post-remove hooks after deletion (if configured)

**Options:**
- `-i, --interactive` - Interactive mode with confirmation prompt
- `--no-hooks` - Skip running lifecycle hooks
- `-f, --force` - Force removal, bypass safety checks

**Safety:**

- Cannot remove main worktree (first worktree in list)
- Prevents removal if worktree has uncommitted changes (unless `--force`)
- Prevents removal if branch is not merged to default branch (unless `--force`)
  - Interactive mode: warns and prompts for confirmation
  - Non-interactive mode: fails with error

**Examples:**

```bash
# Remove a worktree
worktree remove feature/user-auth

# Force remove even with uncommitted changes or unmerged branch
worktree remove feature/user-auth --force
```

### `worktree switch [branch]`

Switch to an existing worktree.

**Arguments:**
- `branch` - The branch name to switch to (optional - interactive mode if omitted)

**Behavior:**
- Shows the `cd` command to navigate to the worktree directory

**Example:**
```bash
worktree switch feature/user-auth
# Shows: cd /path/to/feature-user-auth

worktree switch
# Opens interactive selection menu
```

### `worktree list`

List all active worktrees for the current repository.

**Example:**

```bash
worktree list
# Output:
# /path/to/project/main     abc123 [main]
# /path/to/project/feature  def456 [feature/new-feature]
```

### Global Flags

- `--verbose` - Enable verbose/debug output
- `--help`, `-h` - Show help message
- `--version`, `-v` - Show version number

## Workflow Examples

### Starting Fresh

```bash
# Clone a new project
worktree clone git@github.com:user/amazing-app.git
cd amazing-app/main

# Create a feature branch
worktree create feature/authentication
cd ../feature-authentication

# Do your work...
git add .
git commit -m "Add authentication"
git push

# Switch back to main
worktree switch main
cd /path/shown/by/switch

# When done with feature, remove the worktree
worktree remove feature/authentication
```

### Converting Existing Repo

```bash
# You have an existing project
cd ~/projects/my-app

# Convert it to use worktrees
worktree setup

# Move into the main worktree
cd main

# Create a feature branch
worktree create feature/new-ui
cd ../feature-new-ui
```

### Multiple Features Simultaneously

```bash
# Work on multiple features at once
worktree create feature/frontend
worktree create feature/backend
worktree create feature/tests

# Switch between them easily
worktree switch feature/frontend    # Work on UI
worktree switch feature/backend     # Work on API
worktree switch feature/tests       # Run tests

# Or use interactive mode to choose
worktree switch

# View all your worktrees
worktree list
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](LICENSE) file for details

## Support

- **Issues**: [GitHub Issues](https://github.com/fnebenfuehr/worktree-cli/issues)
- **Discussions**: [GitHub Discussions](https://github.com/fnebenfuehr/worktree-cli/discussions)

---

Made with 🤖 for Reco
