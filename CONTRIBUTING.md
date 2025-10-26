# Contributing to MyDBA

Thank you for your interest in contributing to MyDBA! This document provides guidelines and instructions for contributing to the project.

---

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Submitting Changes](#submitting-changes)
- [Pull Request Process](#pull-request-process)
- [Documentation](#documentation)
- [Community](#community)

---

## Code of Conduct

This project adheres to a Code of Conduct that all contributors are expected to follow. Please be respectful, inclusive, and considerate in all interactions.

### Our Standards

- **Be Respectful**: Treat all contributors with respect and kindness
- **Be Inclusive**: Welcome contributors of all backgrounds and skill levels
- **Be Collaborative**: Work together to improve the project
- **Be Professional**: Keep discussions focused and constructive
- **Be Patient**: Remember that everyone was a beginner once

### Unacceptable Behavior

- Harassment, discrimination, or offensive comments
- Personal attacks or trolling
- Spam or self-promotion
- Sharing private information without consent
- Any behavior that would be inappropriate in a professional setting

### Reporting

If you experience or witness unacceptable behavior, please report it to the project maintainers at conduct@mydba.dev.

---

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: v18.x or v20.x LTS ([Download](https://nodejs.org/))
- **npm**: v9.x or higher (comes with Node.js)
- **VSCode**: v1.85.0 or higher ([Download](https://code.visualstudio.com/))
- **Git**: v2.30 or higher ([Download](https://git-scm.com/))
- **Docker**: For running test databases (optional but recommended)

### Fork and Clone

1. **Fork the repository** on GitHub (click "Fork" button)

2. **Clone your fork**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/mydba.git
   cd mydba
   ```

3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/original/mydba.git
   ```

4. **Verify remotes**:
   ```bash
   git remote -v
   # origin    https://github.com/YOUR_USERNAME/mydba.git (fetch)
   # origin    https://github.com/YOUR_USERNAME/mydba.git (push)
   # upstream  https://github.com/original/mydba.git (fetch)
   # upstream  https://github.com/original/mydba.git (push)
   ```

---

## Development Setup

### Install Dependencies

```bash
npm install
```

### Build the Extension

```bash
npm run compile
```

### Watch Mode (Auto-rebuild)

```bash
npm run watch
```

### Run in VSCode

1. Open the project in VSCode
2. Press `F5` to launch the Extension Development Host
3. A new VSCode window will open with MyDBA installed
4. Test your changes in this window

### Set Up Test Databases (Optional)

```bash
# Start MySQL 8.0 and MariaDB 10.11 containers
docker-compose up -d

# Verify containers are running
docker ps
```

Default test database credentials (from `docker-compose.yml`):
- **MySQL 8.0**: `localhost:3306`, user: `root`, password: `test_password`
- **MariaDB 10.11**: `localhost:3307`, user: `root`, password: `test_password`

For profiling and EXPLAIN features, ensure Performance Schema is enabled for MySQL 8.0+.

---

## Project Structure

```
mydba/
├── src/                      # Source code
│   ├── extension.ts          # Extension entry point
│   ├── connection/           # Database connection management
│   ├── views/                # Tree view providers
│   ├── webviews/             # Webview panels and content
│   ├── ai/                   # AI integration (LM API, RAG, chat)
│   ├── queries/              # SQL query builders
│   ├── metrics/              # Performance metrics collection
│   └── utils/                # Utility functions
├── test/                     # Tests
│   ├── unit/                 # Unit tests
│   ├── integration/          # Integration tests
│   └── e2e/                  # End-to-end tests
├── docs/                     # Documentation
│   ├── PRD.md                # Product Requirements Document
│   ├── PRIVACY.md            # Privacy Policy
│   └── ANONYMIZATION_STRATEGY.md  # Query templating spec
├── resources/                # Icons, images, CSS
├── package.json              # Extension manifest and dependencies
├── tsconfig.json             # TypeScript configuration
├── .eslintrc.json            # ESLint configuration
├── .prettierrc               # Prettier configuration
└── docker-compose.yml        # Test database setup
```

---

## Development Workflow

### 1. Create a Branch

Always create a new branch for your work:

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/issue-number-description
```

**Branch Naming Conventions**:
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Test additions/improvements
- `chore/` - Build, CI, or maintenance tasks

### 2. Make Your Changes

- Write clean, readable code
- Follow the [Coding Standards](#coding-standards)
- Add tests for new features or bug fixes
- Update documentation if needed

### 3. Test Your Changes

```bash
# Run unit tests
npm test

# Run with coverage
npm run test:coverage

# Run integration tests
npm run test:integration

# Run E2E tests (requires VSCode)
npm run test:e2e

# Lint code
npm run lint

# Format code
npm run format
```

### 4. Commit Your Changes

We use [Conventional Commits](https://www.conventionalcommits.org/) format:

```bash
git add .
git commit -m "feat: add support for custom system views"
```

**Commit Message Format**:
```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, semicolons, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Build, CI, or tooling changes
- `perf`: Performance improvements

**Examples**:
```
feat(ai): implement query templating for privacy protection

- Replace simple masking with semantic templating
- Preserve query structure for better AI suggestions
- Update privacy documentation

Closes #42
```

```
fix(connection): handle SSH tunnel timeout gracefully

Fixes #123
```

### 5. Push and Create PR

```bash
# Push to your fork
git push origin feature/your-feature-name

# Create PR on GitHub
```

---

## Coding Standards

### TypeScript Style

- **Use TypeScript**: All new code must be in TypeScript
- **Strict mode**: `"strict": true` in `tsconfig.json`
- **No `any`**: Avoid `any` type; use `unknown` or proper types
- **Interfaces over Types**: Prefer interfaces for object shapes

**Good**:
```typescript
interface DatabaseConnection {
  host: string;
  port: number;
  user: string;
  database: string;
}

async function connect(config: DatabaseConnection): Promise<Connection> {
  // implementation
}
```

**Bad**:
```typescript
function connect(config: any) {  // ❌ Using 'any'
  // implementation
}
```

### Naming Conventions

- **Classes**: PascalCase (`DatabaseConnection`, `TreeViewProvider`)
- **Functions/Methods**: camelCase (`executeQuery`, `getMetrics`)
- **Variables**: camelCase (`connectionConfig`, `queryResult`)
- **Constants**: UPPER_SNAKE_CASE (`DEFAULT_PORT`, `MAX_RETRIES`)
- **Files**: kebab-case (`connection-manager.ts`, `tree-view.ts`)
- **Interfaces**: PascalCase with `I` prefix (optional) (`IConnection` or `Connection`)

### Code Organization

- **One class per file**: Keep files focused and small
- **Max file length**: 300-400 lines (refactor if longer)
- **Max function length**: 50 lines (extract smaller functions)
- **Max parameters**: 3-4 (use options object for more)

**Good**:
```typescript
interface QueryOptions {
  timeout?: number;
  returnType?: 'array' | 'object';
  streaming?: boolean;
}

async function executeQuery(sql: string, options: QueryOptions = {}) {
  // implementation
}
```

**Bad**:
```typescript
async function executeQuery(
  sql: string,
  timeout: number,
  returnType: string,
  streaming: boolean,
  cache: boolean,
  retries: number
) {
  // ❌ Too many parameters
}
```

### Error Handling

- **Use typed errors**: Create custom error classes
- **Provide context**: Include helpful error messages
- **Never swallow errors**: Always log or rethrow
- **User-friendly messages**: Show actionable errors to users

**Good**:
```typescript
class ConnectionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly host: string
  ) {
    super(message);
    this.name = 'ConnectionError';
  }
}

try {
  await connect(config);
} catch (error) {
  if (error instanceof ConnectionError) {
    vscode.window.showErrorMessage(
      `Failed to connect to ${error.host}: ${error.message}`
    );
  }
  throw error;  // Re-throw for logging
}
```

### Async/Await

- **Prefer async/await**: Avoid raw Promises when possible
- **Handle rejections**: Always catch or propagate errors
- **Avoid blocking**: Don't block the extension host

**Good**:
```typescript
async function loadMetrics(): Promise<Metrics> {
  try {
    const data = await fetchMetrics();
    return processMetrics(data);
  } catch (error) {
    logger.error('Failed to load metrics', error);
    throw error;
  }
}
```

### VSCode API Usage

- **Dispose resources**: Always dispose of event listeners, webviews, etc.
- **Use context subscriptions**: Add disposables to `context.subscriptions`
- **Respect cancellation**: Check `CancellationToken` in long operations
- **Progress reporting**: Use `window.withProgress` for long tasks

**Good**:
```typescript
export function activate(context: vscode.ExtensionContext) {
  const treeView = new DatabaseTreeView();

  // Register and add to subscriptions (auto-disposed on deactivate)
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('mydba.databases', treeView),
    vscode.commands.registerCommand('mydba.refresh', () => treeView.refresh())
  );
}
```

---

## Testing Guidelines

### Test Coverage

- **Aim for 80%+ coverage**: All new code should have tests
- **Unit tests**: Test individual functions/classes in isolation
- **Integration tests**: Test interactions between components
- **E2E tests**: Test complete user workflows

### Writing Tests

**Use Jest** for unit and integration tests:

```typescript
import { templateQuery } from '../src/ai/query-templating';

describe('Query Templating', () => {
  it('should template table and column names', () => {
    const input = "SELECT * FROM users WHERE id = 12345";
    const output = templateQuery(input);

    expect(output).toBe("SELECT * FROM <table:users> WHERE <col:id> = ?");
  });

  it('should handle JOINs correctly', () => {
    const input = `
      SELECT u.name, o.total
      FROM users u
      JOIN orders o ON u.id = o.user_id
    `;
    const output = templateQuery(input);

    expect(output).toContain('<table:users>');
    expect(output).toContain('<table:orders>');
    expect(output).toContain('<alias:u>');
  });
});
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- query-templating.test.ts

# Run with coverage
npm run test:coverage

# Watch mode (re-run on changes)
npm run test:watch

# Integration tests (requires Docker)
npm run test:integration

# Profiling/EXPLAIN E2E (renders and diffs)
npm run test:e2e
```

### Test Database Setup

Integration tests use Docker containers:

```bash
# Start test databases
docker-compose -f docker-compose.test.yml up -d

# Run integration tests
npm run test:integration

# Stop test databases
docker-compose -f docker-compose.test.yml down
```

---

## Submitting Changes

### Before Submitting

- [ ] Code compiles without errors (`npm run compile`)
- [ ] All tests pass (`npm test`)
- [ ] Linting passes (`npm run lint`)
- [ ] Code is formatted (`npm run format`)
- [ ] Documentation is updated (if applicable)
- [ ] Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)
- [ ] Branch is up-to-date with `main`:
  ```bash
  git fetch upstream
  git rebase upstream/main
  ```

### Creating a Pull Request

1. **Push your branch** to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Open a PR** on GitHub with:
   - **Clear title**: Use Conventional Commits format
   - **Description**: Explain what and why
   - **Screenshots**: For UI changes
   - **Testing**: Describe how you tested
   - **Related issues**: Reference with `Closes #123` or `Fixes #456`

**PR Template**:
```markdown
## Description
Brief description of changes.

## Motivation
Why is this change needed?

## Changes
- Added feature X
- Fixed bug Y
- Updated documentation Z

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Manually tested on MySQL 8.0 and MariaDB 10.11
 - [ ] Profiling and Visual EXPLAIN verified (screenshots/gifs attached)
- [ ] Tested in VSCode 1.85+

## Screenshots (if applicable)
[Add screenshots for UI changes]

## Checklist
- [ ] Code compiles and runs
- [ ] Tests pass
- [ ] Documentation updated
- [ ] Follows coding standards
- [ ] No breaking changes (or documented)

Closes #123
```

---

## Pull Request Process

### Review Process

1. **Automated Checks**: CI will run tests, linting, and builds
2. **Code Review**: Maintainers will review your code
3. **Feedback**: Address review comments by pushing new commits
4. **Approval**: At least 1 maintainer approval required
5. **Merge**: Maintainer will merge (squash and merge preferred)

### Review Expectations

- **Response Time**: Maintainers aim to review within 48 hours
- **Be Patient**: Complex PRs may take longer
- **Be Responsive**: Reply to comments and questions promptly
- **Be Open**: Accept constructive feedback gracefully

### After Merge

- **Delete Branch**: Clean up your feature branch
- **Update Fork**: Sync your fork with upstream:
  ```bash
  git checkout main
  git fetch upstream
  git merge upstream/main
  git push origin main
  ```

---

## Documentation

### Code Comments

- **Public APIs**: Document with JSDoc
- **Complex Logic**: Explain the "why", not the "what"
- **TODOs**: Use `// TODO:` for future improvements

**Good**:
```typescript
/**
 * Templates a SQL query by replacing sensitive literals with placeholders
 * while preserving table and column names for AI analysis.
 *
 * @param sql - The original SQL query
 * @returns Templated query with <table:name>, <col:name>, and ? placeholders
 *
 * @example
 * templateQuery("SELECT * FROM users WHERE id = 123")
 * // Returns: "SELECT * FROM <table:users> WHERE <col:id> = ?"
 */
export function templateQuery(sql: string): string {
  // Implementation
}
```

### README and Docs

- **Update README.md**: For user-facing features
- **Update docs/**: For technical documentation
- **Add examples**: Show how to use new features
- **Update PRD**: For significant features or changes

---

## Community

### Getting Help

- **GitHub Discussions**: Ask questions, share ideas
- **GitHub Issues**: Report bugs, request features
- **Discord/Slack**: Real-time chat (link TBD)

### Ways to Contribute

Not just code! You can contribute by:

- 🐛 **Reporting Bugs**: Create detailed issue reports
- 💡 **Suggesting Features**: Share your ideas
- 📝 **Improving Docs**: Fix typos, add examples
- 🧪 **Testing**: Test beta releases, report issues
- 🎨 **Design**: Improve UI/UX, create icons
- 🌍 **Translation**: Help localize MyDBA (future)
- 💬 **Community Support**: Help others in discussions

### Recognition

Contributors are recognized in:
- `CONTRIBUTORS.md` file
- Release notes
- Project README

---

## License

By contributing to MyDBA, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).

---

## Questions?

If you have questions not covered here:

- **GitHub Discussions**: https://github.com/yourusername/mydba/discussions
- **Email**: contribute@mydba.dev
- **Documentation**: https://github.com/yourusername/mydba/docs

---

**Thank you for contributing to MyDBA!** 🎉

Your contributions help make database management in VSCode better for everyone.
