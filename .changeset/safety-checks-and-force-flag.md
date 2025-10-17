---
"@fnebenfuehr/worktree-cli": minor
---

Add comprehensive safety checks for worktree removal with new --force flag. Fixes process.cwd() error when removing current worktree. Now prevents removal if uncommitted changes exist or branch is unmerged (interactive mode prompts for confirmation, non-interactive mode errors). Use --force to bypass all safety checks.
