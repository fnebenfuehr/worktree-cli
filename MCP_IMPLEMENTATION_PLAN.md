# MCP Implementation Plan

**Goal**: Add MCP server support to worktree-cli for AI assistant integration

**Philosophy**: Simplicity over engineering, clean/readable code, smart decisions

---

## Architecture Decisions

### Runtime & Compatibility
- ✅ MCP SDK works with Bun runtime
- Use Node.js-compatible stdio for MCP server (Bun provides this)
- Keep Bun shell APIs for git operations (existing pattern)
- No special considerations needed for long-lived processes

### Error Handling Strategy
Transform typed errors → structured responses:

```typescript
type ToolResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string; type: string; recoverable: boolean; suggestion?: string }
```

Create `handleToolError` wrapper that:
1. Catches `GitError`, `ValidationError`, `FileSystemError`
2. Transforms to structured `ToolResult`
3. Returns to Claude for intelligent handling
4. MCP call always "succeeds" from protocol perspective

### Code Organization
Extract core logic from CLI commands:

```
src/
├── core/           # NEW: Pure business logic, no prompts/output
│   └── worktree.ts
├── commands/       # Existing: CLI with interactive UX
│   └── *.ts
├── mcp/            # NEW: MCP server + tool handlers
│   ├── server.ts
│   ├── tools.ts
│   └── types.ts
└── utils/          # Existing: Git utilities (reuse)
```

**Pattern**:
- `core/worktree.ts`: Pure functions, return data
- `commands/*.ts`: CLI wraps core with prompts/spinners
- `mcp/tools.ts`: Wraps core with error handling

No `--json` flags needed - MCP bypasses CLI entirely.

---

## MCP Tools (6 Core Tools)

### 1. worktree_status
**Purpose**: Check if repo is worktree-enabled

**Description**: "Check if repo uses worktrees. Call this first before other operations."

**Input**: None

**Output**:
```typescript
{
  success: true,
  data: {
    enabled: boolean,
    worktrees: number,
    mainBranch?: string
  }
}
```

**Logic**:
```typescript
// Check if repo is worktree-enabled (not just if current dir is a worktree)
const gitDir = await execGit(['rev-parse', '--git-dir']);
const hasWorktrees = await exists(`${gitDir}/worktrees/`);
const isBare = gitDir.endsWith('.git') || gitDir.includes('.bare');
return { enabled: hasWorktrees || isBare };
```

**Note**: May need to adapt existing utils or add new helper if not powerful enough

---

### 2. worktree_list
**Purpose**: Show all worktrees

**Description**: "List all worktrees. Use to check what exists or show user active work."

**Input**: None

**Output**:
```typescript
{
  success: true,
  data: {
    worktrees: Array<{
      path: string,
      branch: string,
      commit: string,
      bare: boolean
    }>
  }
}
```

**Logic**: Call existing `getWorktreeList()` util

---

### 3. worktree_create
**Purpose**: Create isolated worktree for feature/bugfix/experiment

**Description**: "Create isolated worktree for features, bugfixes, or experiments. Use when user wants to work on something new without affecting current work. Branch format: feature/name, bugfix/name, or experiment/name. Check worktree_status first if unsure if repo is worktree-enabled."

**Input**:
```typescript
{
  branch: string,      // Required: feature/dark-mode
  base?: string        // Optional: base branch (defaults to main)
}
```

**Output**:
```typescript
{
  success: true,
  data: {
    path: string,      // Absolute path to worktree
    branch: string
  }
}
```

**Logic**: Extract from `createCommand`, reuse git utils

---

### 4. worktree_switch
**Purpose**: Get path to existing worktree

**Description**: "Get the absolute path for a worktree branch. Use this path to read/write files in that worktree. You can access files at <path>/src/file.ts directly."

**Input**:
```typescript
{
  branch: string  // Branch name or worktree identifier
}
```

**Output**:
```typescript
{
  success: true,
  data: {
    path: string,   // Claude uses this path directly
    branch: string
  }
}
```

**Logic**: Extract from `switchCommand`, find matching worktree

**Note**: Claude Code can't execute `cd`, but can read/write files at returned path

---

### 5. worktree_remove
**Purpose**: Delete worktree after feature merged

**Description**: "Delete worktree. Use after feature is merged. Never force unless user explicitly requests."

**Input**:
```typescript
{
  identifier: string,  // Branch name or path
  force?: boolean      // Default: false
}
```

**Output**:
```typescript
{
  success: true,
  data: {
    removed: string,   // Path that was removed
    message: string
  }
}
```

**Logic**: Extract from `removeCommand`, reuse git utils

---

### 6. worktree_setup
**Purpose**: Convert repo to worktree structure

**Description**: "Convert repo to worktree structure. Use when user wants to enable worktrees for first time. Moves current repo to bare structure with main worktree."

**Input**:
```typescript
{
  targetDir?: string  // Optional: parent dir (defaults to ../)
}
```

**Output**:
```typescript
{
  success: true,
  data: {
    barePath: string,
    mainWorktreePath: string,
    message: string
  }
}
```

**Logic**: Extract from `setupCommand`, reuse existing logic

---

## CLI Commands

### worktree mcp start
**Purpose**: Start MCP server (used by AI tools)

**Behavior**:
- Start stdio-based MCP server
- Register 6 tools
- Run until killed (long-lived process)
- All logs to stderr (stdout is MCP protocol)

**Implementation**: `src/commands/mcp.ts` + `src/mcp/server.ts`

---

### worktree mcp config
**Purpose**: Show configuration for AI tools

**Output Format**:
```
MCP Server Configuration for worktree-cli
==========================================

Add this to your AI assistant configuration:

Claude Desktop (~/.config/Claude/claude_desktop_config.json):
{
  "mcpServers": {
    "worktree": {
      "command": "worktree",
      "args": ["mcp", "start"]
    }
  }
}

Cody (VS Code settings.json):
{
  "mcp.servers": {
    "worktree": {
      "command": "worktree",
      "args": ["mcp", "start"]
    }
  }
}

Cursor (.cursor/config.json):
{
  "mcpServers": {
    "worktree": {
      "command": "worktree",
      "args": ["mcp", "start"]
    }
  }
}

After adding, restart your AI assistant.
Test with: worktree mcp test
```

**Optional**: `--json` flag outputs just the config object

---

### worktree mcp test
**Purpose**: Health check - verify MCP server works

**Behavior**:
1. Spawn `worktree mcp start` as child process
2. Send `tools/list` request via stdin
3. Parse stdout, verify 6 tools returned
4. Kill process
5. Report success/failure with ✓/✗

**Output**:
```
Testing MCP server...
✓ Server starts successfully
✓ Tools registered (6 tools available)
✓ Server responds to requests

Ready to use with AI assistants!
```

---

## Implementation Phases

### Phase 1: Core Logic Extraction
**Goal**: Separate business logic from CLI presentation

**Why first**: Extract logic first (can test with existing CLI), then wrap with MCP (isolated change)

- [ ] Create `src/core/worktree.ts`
- [ ] Extract pure logic from commands:
  - [ ] `createWorktree(branch, base)`
  - [ ] `listWorktrees()`
  - [ ] `removeWorktree(identifier, force)`
  - [ ] `switchWorktree(branch)`
  - [ ] `setupWorktrees(targetDir)`
  - [ ] `getWorktreeStatus()`
- [ ] Update CLI commands to use core functions
- [ ] Test: Existing CLI commands still work

---

### Phase 2: MCP Foundation
**Goal**: Set up MCP server structure, no tools yet

- [ ] Add dependency: `@modelcontextprotocol/sdk@^0.5.0`
- [ ] Create `src/mcp/types.ts` (ToolResult, error types)
- [ ] Create `src/mcp/server.ts` (empty server, stdio transport)
- [ ] Create `src/commands/mcp.ts` (start/config/test subcommands)
- [ ] Test: `worktree mcp start` runs without crashing

---

### Phase 3: Error Handling
**Goal**: Transform errors to structured responses

- [ ] Create `handleToolError` wrapper in `src/mcp/tools.ts`
- [ ] Map error types:
  - `GitError` → `type: "git_error"`
  - `ValidationError` → `type: "validation_error"`
  - `FileSystemError` → `type: "filesystem_error"`
  - Unknown → `type: "unknown_error"`
- [ ] Add recovery suggestions for common errors
- [ ] Test: Errors return structured responses

---

### Phase 4: Tool Implementation
**Goal**: Wire up all 6 MCP tools

- [ ] Implement tool handlers in `src/mcp/tools.ts`:
  - [ ] `worktree_status`
  - [ ] `worktree_list`
  - [ ] `worktree_create`
  - [ ] `worktree_switch`
  - [ ] `worktree_remove`
  - [ ] `worktree_setup`
- [ ] Register tools in `src/mcp/server.ts`
- [ ] Write concise, actionable tool descriptions
- [ ] Test: `worktree mcp test` passes

---

### Phase 5: CLI Commands
**Goal**: Finish mcp subcommands

- [ ] Implement `worktree mcp config` (all tool configs)
- [ ] Implement `worktree mcp config --json`
- [ ] Implement `worktree mcp test` (health check)
- [ ] Test: All three commands work correctly

---

### Phase 6: Documentation
**Goal**: Update README, add usage examples

- [ ] Add "MCP Server Support" section to README
- [ ] Explain what MCP enables (AI assistant integration)
- [ ] Configuration instructions (copy/paste from `worktree mcp config`)
- [ ] Example workflow: "Create feature branch with Claude"
- [ ] List compatible AI tools (Claude Desktop, Cody, Cursor)
- [ ] Troubleshooting section

---

### Phase 7: Testing & Polish
**Goal**: Manual testing, bug fixes, refinement

- [ ] Test with Claude Desktop (manual)
- [ ] Test each tool in real usage
- [ ] Verify error handling edge cases
- [ ] Check stdio logging (nothing on stdout except MCP)
- [ ] Performance check (tool response times)
- [ ] Update changelog

---

## Technical Constraints

### Stdio Protocol
- ✅ All MCP communication via stdin/stdout
- ⚠️ Logging MUST go to stderr only
- ⚠️ Never use console.log in MCP server code
- ✅ Use console.error for debugging

### Error Handling
- ✅ Tools return structured ToolResult, never throw
- ✅ Preserve error type information for Claude
- ✅ Include recovery suggestions when possible
- ⚠️ Don't duplicate validation (trust existing logic)

### Git Operations
- ✅ Reuse existing `src/utils/git.ts` utilities
- ✅ All git commands go through `execGit()`
- ✅ Use porcelain format for parseable output

### Dependencies
- Only add: `@modelcontextprotocol/sdk`
- Keep existing Bun runtime
- No additional CLI dependencies needed

---

## Testing Strategy

### Manual Testing
1. Build: `bun run build`
2. Start server: `worktree mcp start` (should wait for input)
3. Send test request: `echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | worktree mcp start`
4. Verify tools returned on stdout

### Integration Testing (with Claude Desktop)
1. Run `worktree mcp config`
2. Copy config to `~/.config/Claude/claude_desktop_config.json`
3. Restart Claude Desktop
4. Test in conversation:
   - "Check if this repo uses worktrees"
   - "Create a feature branch for dark mode"
   - "List all my worktrees"
   - "Switch to the main worktree"

### Automated Testing
- `worktree mcp test` health check
- Existing unit tests cover core logic
- Don't duplicate testing in MCP layer

---

## Example Workflow (for README)

**User in Claude Code**: "Let's add a dark mode feature"

**Claude's Internal Flow**:
1. Calls `worktree_status` → `{enabled: true}`
2. Calls `worktree_create("feature/dark-mode")` → `{path: "/repo/feature-dark-mode"}`
3. Responds: "Created isolated workspace at ../feature-dark-mode. I can now work on dark mode without affecting your main branch."
4. Uses returned path to read/write files in feature worktree

**User**: "Now show me all my active work"

**Claude**:
1. Calls `worktree_list` → `{worktrees: [...]}`
2. Responds: "You have 3 active worktrees: main, feature/dark-mode, bugfix/login-error"

---

## Open Questions (Resolved)

✅ Bun compatibility → Works perfectly, no special handling
✅ Error handling → Structured ToolResult with type/suggestion
✅ Switch behavior → Return path, Claude uses it directly
✅ JSON flags → Not needed, MCP bypasses CLI
✅ Config helper → Show all tools at once, easy to copy
✅ Tool descriptions → Concise but actionable (what/when/constraints)
✅ Validation → Trust existing error handling
✅ Test command → Simple health check (tools/list)
✅ Additional tools → Start with 6 core tools, iterate
✅ Phase order → Extract core first, then MCP (cleaner)

---

## Success Criteria

- [ ] `worktree mcp start` runs MCP server successfully
- [ ] All 6 tools registered and working
- [ ] `worktree mcp test` passes health check
- [ ] Claude Desktop integration works end-to-end
- [ ] Error messages are clear and actionable
- [ ] Documentation complete and user-friendly
- [ ] No breaking changes to existing CLI

---

**Next Step**: Execute Phase 1 (Core Logic Extraction) when ready to implement
