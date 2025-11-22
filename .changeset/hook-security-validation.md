---
"@fnebenfuehr/worktree-cli": minor
---

Add security validation for hook commands before execution. Blocks dangerous patterns (curl|sh, sudo, eval, unsafe rm -rf) and prompts for confirmation on unrecognized commands. Use --trust-hooks to bypass validation.
