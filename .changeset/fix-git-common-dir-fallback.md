---
"@fnebenfuehr/worktree-cli": patch
---

Fix getGitCommonDir to work from parent worktree folder by adding fallback to find git repos in subdirectories, prioritizing default branch worktree.
