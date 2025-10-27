# Pull Request Checks Guide

## Overview

Every pull request to MyDBA goes through automated checks to ensure code quality, security, and license compliance. This document explains each check and how to fix common issues.

---

## Required Checks (Must Pass)

### 1. ✅ Build and Test
**What it checks:** Code compilation and unit/integration tests

**How to fix failures:**
```bash
# Compile TypeScript
npm run compile

# Run all tests
npm test

# Run with Docker (integration tests)
docker-compose -f docker-compose.test.yml up -d
npm run test:integration
```

**Status:** ❌ PR blocked if fails

---

### 2. ✅ License Compliance
**What it checks:** All dependencies use approved licenses

**Allowed licenses:**
- MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause
- ISC, 0BSD, CC0-1.0, Python-2.0

**Disallowed licenses (copyleft/restrictive):**
- GPL, AGPL, LGPL (viral copyleft)
- SSPL (Server Side Public License)
- CC-BY-NC (non-commercial)

**How to check locally:**
```bash
# Quick summary
npm run license:check

# Verify compliance (same as CI)
npm run license:verify

# Generate detailed reports
npm run license:report
```

**What happens on PR:**
- ✅ **Pass:** Green check, comment posted, `license:compliant` label added
- ❌ **Fail:** Red X, detailed comment with remediation steps, `license:violation` and `blocked` labels added
- ⚠️ **Warning:** Yellow warning, comment posted, PR can still merge

**How to fix violations:**
1. Identify the problematic package in the PR comment
2. Find an alternative with a compatible license
3. Remove the dependency if not critical
4. Request an exception (requires legal review)

**Status:** ❌ PR blocked if fails, ⚠️ warning only for unverified licenses

**Documentation:** See [License Compliance Policy](LICENSE_COMPLIANCE.md)

---

### 3. ✅ Linting (ESLint)
**What it checks:** Code style and common issues

**How to fix:**
```bash
# Check for issues
npm run lint

# Auto-fix many issues
npm run lint:fix
```

**Status:** ❌ PR blocked if fails

---

### 4. ✅ Test Coverage
**What it checks:** Code coverage ≥ 70%

**How to check:**
```bash
# Run tests with coverage
npm run test:coverage

# View HTML report
open coverage/index.html
```

**Status:** ⚠️ Warning if below threshold (doesn't block)

---

## Optional Checks (Informational)

### 5. 📊 Code Scanning (CodeQL)
**What it checks:** Security vulnerabilities and code quality issues

**Runs:** Weekly + on push to main/develop

**Status:** ℹ️ Informational only

---

### 6. 🏷️ Auto-labeling
**What it does:** Automatically adds labels based on:
- **Size:** XS, S, M, L, XL (based on lines changed)
- **Type:** test, documentation, dependencies, ci, sql
- **Area:** database, ai, ui
- **Breaking changes:** Detected from title/body

**Status:** ℹ️ Informational only

---

## PR Lifecycle

### When You Open a PR

1. **Automated checks start** within seconds
2. **License check runs first** (~30 seconds)
   - Posts comment with status
   - Adds labels automatically
   - Blocks merge if violations found
3. **Build & test runs** (~2-5 minutes)
4. **Coverage reports generated**
5. **Auto-labels applied**

### Status Icons

- ✅ **Green check** - All tests passed, ready to merge
- ❌ **Red X** - Tests failed, PR blocked
- ⚠️ **Yellow warning** - Warning only, doesn't block
- 🔄 **Running** - Check in progress
- ⏸️ **Skipped** - Check not required for this PR

### PR Comments

The bot will post comments with:
- **License compliance status** (✅/❌/⚠️)
- **Detailed license summary** (if issues found)
- **Remediation steps** (how to fix)
- **Links to detailed reports**

Comments are automatically updated on each push to avoid spam.

---

## Common Issues and Solutions

### Issue: License Compliance Failed

**Symptom:** Red X on license check, PR comment shows disallowed licenses

**Solution:**
```bash
# 1. Check which packages have issues
npm run license:check

# 2. Remove or replace the package
npm uninstall <problematic-package>
npm install <alternative-package>

# 3. Verify fix
npm run license:verify

# 4. Commit and push
git add package.json package-lock.json
git commit -m "fix: replace package with license violation"
git push
```

### Issue: Tests Failing Locally But Pass in CI

**Causes:**
- Different Node version
- Missing Docker containers
- Cached node_modules

**Solution:**
```bash
# Use same Node version as CI (20.x)
nvm use 20

# Clean install
rm -rf node_modules package-lock.json
npm install

# Ensure Docker is running
docker-compose -f docker-compose.test.yml up -d
```

### Issue: Coverage Below Threshold

**Solution:**
```bash
# Identify uncovered code
npm run test:coverage
open coverage/index.html

# Add tests for uncovered lines
# Re-run coverage
npm run test:coverage
```

### Issue: Linting Errors

**Quick fix:**
```bash
# Auto-fix most issues
npm run lint:fix

# Manual fixes needed for remaining issues
npm run lint
```

---

## Bypassing Checks (Not Recommended)

Checks are designed to catch issues early. Bypassing is **strongly discouraged** but may be necessary in rare cases:

### Requesting an Exception

If you need to bypass a check:

1. **Create an issue** explaining:
   - Why the check is blocking
   - Business justification
   - Alternative solutions considered
   - Risk assessment

2. **Get approval** from maintainers

3. **Document the exception** in:
   - PR description
   - Code comments
   - Relevant documentation

### Temporary Skips (Development Only)

For development branches only:
```bash
# Skip license check (LOCAL ONLY, never commit)
npm install <package> --no-save

# Mark test as skipped temporarily
test.skip('Feature under development', async () => {
  // ...
});
```

---

## PR Checklist

Before requesting review:

- [ ] All automated checks are green ✅
- [ ] License compliance verified (`npm run license:verify`)
- [ ] Tests added for new code
- [ ] Documentation updated
- [ ] CHANGELOG.md updated (if applicable)
- [ ] Breaking changes documented
- [ ] Commit messages follow conventions
- [ ] Branch up-to-date with target

---

## Getting Help

### Check Status
- View check details by clicking the red X or yellow warning
- Read the full log in GitHub Actions
- Check PR comments for specific guidance

### Ask for Help
- Comment on the PR mentioning `@maintainers`
- Create a discussion in GitHub Discussions
- Check [CONTRIBUTING.md](../CONTRIBUTING.md) for more details

### Report Issues with Checks
If a check is incorrectly failing:
1. Verify locally first
2. Check if it's a known issue
3. Open an issue with:
   - PR link
   - Check that failed
   - Expected vs actual behavior
   - Logs/screenshots

---

## Resources

- [License Compliance Policy](LICENSE_COMPLIANCE.md)
- [Contributing Guide](../CONTRIBUTING.md)
- [Testing Guide](../CONTRIBUTING.md#testing-guidelines)
- [GitHub Actions Workflows](../../.github/workflows/)

---

*Last Updated: October 27, 2025*
