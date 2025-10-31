## Description

<!-- Provide a clear and concise description of your changes -->

## PR Title Format ⚠️

**Important:** Your PR title must follow [Conventional Commits](https://www.conventionalcommits.org/) format:

- `feat: add new feature` - New feature (minor version bump)
- `fix: resolve bug` - Bug fix (patch version bump)
- `docs: update documentation` - Documentation only (no version bump)
- `style: format code` - Code style changes (no version bump)
- `refactor: restructure code` - Code refactoring (no version bump)
- `perf: improve performance` - Performance improvements (patch version bump)
- `test: add tests` - Test additions or changes (no version bump)
- `chore: update build` - Build/tooling changes (no version bump)
- `feat!: breaking change` - Breaking change (major version bump)

**Breaking changes** can be indicated by:
- Adding `!` after the type: `feat!: remove legacy API`
- Including `BREAKING CHANGE:` in the PR body

## Type of Change

<!-- Check all that apply -->

- [ ] 🐛 Bug fix (non-breaking change which fixes an issue)
- [ ] ✨ New feature (non-breaking change which adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] 📝 Documentation update
- [ ] 🎨 Code style/refactoring
- [ ] ⚡ Performance improvement
- [ ] ✅ Test update
- [ ] 🔧 Build/tooling update

## Testing

<!-- Describe the tests you ran and how to reproduce them -->

- [ ] Unit tests pass (`npm run test:unit`)
- [ ] Integration tests pass (`npm test`)
- [ ] Linting passes (`npm run lint`)
- [ ] Manual testing completed

**Test Configuration:**
- OS:
- Node version:
- VS Code version:

## Breaking Changes

<!-- If this PR introduces breaking changes, describe them here -->
<!-- Include migration instructions for users -->

**BREAKING CHANGE:** (if applicable)
<!-- Describe what breaks and how users should migrate -->

## Checklist

- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings or errors
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published

## Related Issues

<!-- Link any related issues here -->

Closes #
Related to #

## Additional Context

<!-- Add any other context, screenshots, or information about the PR here -->

---

**Note:** After merging, the version will be automatically bumped and the changelog will be updated based on your PR title.
