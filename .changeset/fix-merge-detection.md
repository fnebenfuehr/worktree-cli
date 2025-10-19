---
'@fnebenfuehr/worktree-cli': patch
---

Fix merge detection to correctly check if branch is merged locally. Previously used `git branch --merged` which showed branches that are ancestors of target (opposite behavior). Now uses `git merge-base --is-ancestor` to properly detect if branch commits are reachable from target branch, regardless of push status.
