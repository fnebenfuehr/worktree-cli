# Tests

This directory contains tests for the git-worktree-cli.

## Running Tests

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test --watch

# Run specific test file
bun test tests/utils.test.ts

# Run with coverage
bun test --coverage
```

## Test Structure

- `utils.test.ts` - Tests for utility functions (fs, string manipulation)
- `git.test.ts` - Tests for git operations
- Integration tests should be added for command workflows

## Writing Tests

Tests use Bun's built-in test runner. Example:

```typescript
import { describe, test, expect } from 'bun:test';

describe('feature', () => {
  test('does something', () => {
    expect(true).toBe(true);
  });
});
```

## Future Tests

- [ ] Integration tests for full command workflows
- [ ] Mock git operations for isolated testing
- [ ] Test error handling scenarios
- [ ] Test edge cases (empty repos, no git, etc.)
