# Contributing to Git Worktree CLI

Thank you for considering contributing to Git Worktree CLI! This document provides guidelines and instructions for contributing.

## Code of Conduct

Be respectful and constructive in all interactions.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR-USERNAME/worktree-cli.git
   cd worktree-cli
   ```
3. **Install dependencies**:
   ```bash
   bun install
   ```
4. **Create a branch** for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Workflow

### Running the CLI in Development

```bash
bun run dev --help
```

### Running Tests

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test --watch
```

### Type Checking

```bash
bun run typecheck
```

### Building

```bash
bun run build
```

## Making Changes

### Code Style

- Use TypeScript with strict mode enabled
- Follow existing code style and conventions
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions small and focused

### Commit Messages

Use clear, descriptive commit messages:

```
type: Brief description (50 chars or less)

More detailed explanation if needed. Wrap at 72 characters.

- Bullet points are okay
- Use imperative mood ("Add feature" not "Added feature")
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `refactor`: Code refactoring
- `test`: Test changes
- `chore`: Build process or auxiliary tool changes

### Documenting Changes with Changesets

This project uses [Changesets](https://github.com/changesets/changesets) for version management and changelog generation.

**When making changes that affect users, create a changeset:**

```bash
bun run changeset
```

This will prompt you to:
1. Select the change type:
   - **patch**: Bug fixes, minor tweaks (0.1.0 → 0.1.1)
   - **minor**: New features, non-breaking changes (0.1.0 → 0.2.0)
   - **major**: Breaking changes (0.1.0 → 1.0.0)
2. Describe your changes in user-friendly language

A changeset file will be created in `.changeset/` - commit this with your changes.

**When to create a changeset:**
- New features or commands
- Bug fixes
- Breaking changes
- Performance improvements
- Dependency updates affecting users

**When NOT to create a changeset:**
- Documentation-only changes
- Internal refactoring with no user impact
- Test additions or updates
- CI/CD configuration changes

### Adding a New Command

1. Create command file: `src/commands/your-command.ts`
2. Implement the command function
3. Add to CLI router in `src/index.ts`
4. Add tests in `tests/`
5. Update documentation

Example command structure:

```typescript
import { intro, outro, spinner } from '@/utils/prompts';
import { ValidationError } from '@/utils/errors';

export async function yourCommand(arg: string): Promise<number> {
  if (!arg) {
    throw new ValidationError('Argument required. Usage: worktree your-command <arg>');
  }

  const s = spinner();
  s.start('Processing');

  try {
    // Do work
    s.stop('Done!');
    outro('Success!');
    return 0;
  } catch (error) {
    throw error; // Error handler in index.ts will display it
  }
}
```

### Adding Tests

Tests use Bun's built-in test runner:

```typescript
import { describe, test, expect } from 'bun:test';

describe('your feature', () => {
  test('does something', () => {
    expect(true).toBe(true);
  });
});
```

## Pull Request Process

1. **Update documentation** if needed
2. **Add tests** for new features
3. **Ensure all tests pass**: `bun test`
4. **Ensure type checking passes**: `bun run typecheck`
5. **Create a changeset** if your changes affect users: `bun run changeset`
6. **Push to your fork** and submit a pull request

### Pull Request Guidelines

- Provide a clear description of the changes
- Reference any related issues
- Include screenshots for UI changes
- Keep PRs focused - one feature/fix per PR
- Be responsive to feedback

## Questions?

Feel free to open an issue for:
- Bug reports
- Feature requests
- Questions about contributing
- General feedback

## Release Process

**For Maintainers:**

Releases are managed using Changesets and GitHub Actions.

### Automated Release (Recommended)

When changesets are merged to `main`, GitHub Actions automatically:
1. Creates/updates a "Version Packages" PR
2. Updates CHANGELOG.md with all pending changesets
3. Bumps version in package.json
4. When you merge this PR, it publishes to npm

### Manual Release

If needed, you can release manually:

```bash
# 1. Update versions and generate CHANGELOG
bun run version

# 2. Commit changes
git add .
git commit -m "chore: release version"

# 3. Publish to npm
bun run release

# 4. Create GitHub release
gh release create v$(node -p "require('./package.json').version")
```

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
