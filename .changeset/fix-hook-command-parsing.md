---
"@fnebenfuehr/worktree-cli": patch
---

Fix hook command execution failing due to improper argument parsing. Hook commands with arguments (e.g., "bun install") now execute correctly via platform-specific shell wrapper (sh -c on Unix, cmd /c on Windows). Includes improved error messages with shell context.
