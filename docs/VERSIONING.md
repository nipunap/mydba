# Automated Versioning and Changelog

This document describes the automated version bump and changelog generation system for MyDBA.

## Overview

MyDBA uses a two-phase approach for version management:

1. **Phase 1 (PR Level)**: Validate PR titles, add labels, and preview changes
2. **Phase 2 (Post-Merge)**: Automatically update version and changelog after merge to main

This approach prevents merge conflicts, handles fork contributions, and ensures consistent versioning.

## For Contributors

### PR Title Format

Your PR title **must** follow [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <description>
```

### Valid Types and Version Bumps

| Type | Description | Version Bump | Example |
|------|-------------|--------------|---------|
| `feat:` | New feature | Minor (1.0.0 → 1.1.0) | `feat: add query cache` |
| `fix:` | Bug fix | Patch (1.0.0 → 1.0.1) | `fix: connection timeout` |
| `perf:` | Performance | Patch (1.0.0 → 1.0.1) | `perf: optimize queries` |
| `docs:` | Documentation | None | `docs: update README` |
| `style:` | Code style | None | `style: format code` |
| `refactor:` | Refactoring | None | `refactor: simplify logic` |
| `test:` | Tests | None | `test: add unit tests` |
| `chore:` | Maintenance | None | `chore: update deps` |
| `ci:` | CI/CD | None | `ci: update workflow` |
| `build:` | Build system | None | `build: update esbuild` |
| `feat!:` | Breaking change | Major (1.0.0 → 2.0.0) | `feat!: remove legacy API` |

### Breaking Changes

Indicate breaking changes by:
- Adding `!` after type: `feat!: remove old API`
- Including `BREAKING CHANGE:` in PR body

Breaking changes require approval from a maintainer before merge.

### Examples

**Good:**
```
feat: add query caching support
fix(mysql): resolve connection timeout
docs: update database setup guide
feat!: redesign connection management
refactor(ai): improve query templating
```

**Bad:**
```
Update README          ❌ Missing type
added new feature      ❌ Wrong format
Fix bug                ❌ Missing description
FEAT: Add cache        ❌ Type must be lowercase
```

## What Happens Automatically

### On PR to Main

1. **Title Validation**: Checks PR title format
2. **Version Label**: Adds `version:major/minor/patch/none`
3. **Breaking Check**: Adds `breaking-change` label if detected
4. **Preview Comment**: Shows version bump and changelog preview

### After Merge to Main

1. **Version Bump**: Updates `package.json`
2. **Changelog Update**: Adds entry to `CHANGELOG.md`
3. **Git Tag**: Creates version tag (e.g., `v1.1.0`)
4. **Success Comment**: Posts summary on PR

## Local Testing

Test your PR title before pushing:

```bash
# Validate PR title
node scripts/validate-pr-title.js "feat: add new feature"

# Preview changelog
npm run version:preview

# With environment variables
PR_TITLE="feat: add cache" PR_NUMBER=123 NEW_VERSION=1.1.0 npm run version:preview
```

## For Maintainers

### Approving Breaking Changes

If a PR has a breaking change:

1. Review the changes carefully
2. Ensure migration instructions are provided
3. Add the `approved-breaking-change` label
4. PR can then be merged

### Manual Version Management

For emergency fixes or special cases:

```bash
# Update version manually
npm version patch  # or minor, major

# Update CHANGELOG.md manually

# Commit and push
git add package.json CHANGELOG.md
git commit -m "chore: release version X.Y.Z"
git push origin main
```

The automation will detect the version was already bumped and skip.

## Workflow Files

- `.github/workflows/pr-version-check.yml` - PR validation
- `.github/workflows/auto-version-bump.yml` - Post-merge automation
- `scripts/validate-pr-title.js` - Title validation script
- `scripts/generate-changelog.js` - Changelog generation script

## Troubleshooting

### PR Validation Fails

**Problem**: Red X on PR, comment about invalid title

**Solution**: Update your PR title to follow the format above

### Breaking Change Blocked

**Problem**: PR with breaking change can't merge

**Solution**: Wait for maintainer to add `approved-breaking-change` label

### Version Didn't Bump

**Problem**: Merged PR but version wasn't updated

**Possible causes**:
- PR didn't target `main` branch
- PR label was `version:none` (docs/chore/etc)
- Workflow failed (check Actions tab)

### Changelog Incorrect

**Problem**: Changelog entry doesn't look right

**Solution**:
- Check PR title format
- Manually edit CHANGELOG.md if needed
- Future PRs will work correctly

## Architecture

### Why Post-Merge?

The post-merge approach solves several problems:

1. **No Merge Conflicts**: Only one commit to main after merge
2. **Works with Forks**: No need to push to PR branch
3. **No Race Conditions**: Sequential version increments
4. **Clean History**: Version bumps are separate commits

### Workflow Diagram

```
PR Opened → Validate Title → Add Labels → Post Preview
                ↓
            Review & Approve
                ↓
            Merge to Main
                ↓
            Find PR Info → Bump Version → Update Changelog → Create Tag → Comment
```

## Reference

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)
