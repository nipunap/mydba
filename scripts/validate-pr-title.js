#!/usr/bin/env node

/**
 * Validate PR Title Format
 *
 * Validates that PR titles follow Conventional Commits format
 * https://www.conventionalcommits.org/
 */

const VALID_TYPES = [
  'feat',     // New feature
  'fix',      // Bug fix
  'docs',     // Documentation only
  'style',    // Code style (formatting, missing semi colons, etc)
  'refactor', // Code change that neither fixes a bug nor adds a feature
  'perf',     // Performance improvement
  'test',     // Adding or correcting tests
  'chore',    // Changes to build process or auxiliary tools
  'ci',       // CI/CD changes
  'build',    // Build system or external dependencies
];

// Regex pattern for conventional commits
// Matches: type(scope)?: description or type!: description
const CONVENTIONAL_COMMIT_REGEX = /^(feat|fix|docs|style|refactor|perf|test|chore|ci|build)(\(.+?\))?(!)?:\s*.+/;

/**
 * Validate PR title
 * @param {string} title - The PR title to validate
 * @returns {{valid: boolean, error?: string, type?: string, breaking?: boolean}}
 */
function validatePRTitle(title) {
  if (!title || typeof title !== 'string') {
    return {
      valid: false,
      error: 'PR title is required',
    };
  }

  const trimmedTitle = title.trim();

  if (trimmedTitle.length === 0) {
    return {
      valid: false,
      error: 'PR title cannot be empty',
    };
  }

  // Check if it matches conventional commit format
  const match = trimmedTitle.match(CONVENTIONAL_COMMIT_REGEX);

  if (!match) {
    return {
      valid: false,
      error: `PR title must follow Conventional Commits format.\n\nExpected format: type(scope)?: description\n\nExamples:\n  - feat: add query cache\n  - fix(mysql): connection timeout\n  - feat!: remove legacy API (breaking change)\n\nValid types: ${VALID_TYPES.join(', ')}`,
    };
  }

  const [, type, scope, breaking] = match;

  // Check for description after colon
  const colonIndex = trimmedTitle.indexOf(':');
  const description = trimmedTitle.substring(colonIndex + 1).trim();

  if (description.length === 0) {
    return {
      valid: false,
      error: 'Description after colon cannot be empty',
    };
  }

  // Check description doesn't start with capital letter (conventional commits style)
  if (description.charAt(0) === description.charAt(0).toUpperCase() && description.charAt(0) !== description.charAt(0).toLowerCase()) {
    return {
      valid: false,
      error: 'Description should start with lowercase letter (conventional commits convention)',
    };
  }

  return {
    valid: true,
    type,
    scope: scope ? scope.replace(/[()]/g, '') : undefined,
    breaking: !!breaking,
    description,
  };
}

/**
 * Determine version bump type from PR title
 * @param {string} title - The PR title
 * @param {string} body - The PR body (optional)
 * @returns {'major' | 'minor' | 'patch' | 'none'}
 */
function determineVersionBump(title, body = '') {
  const validation = validatePRTitle(title);

  if (!validation.valid) {
    throw new Error(`Invalid PR title: ${validation.error}`);
  }

  const { type, breaking } = validation;

  // Check for breaking change in title or body
  const hasBreakingChange = breaking || body.includes('BREAKING CHANGE:');

  if (hasBreakingChange) {
    return 'major';
  }

  // feat = minor version bump
  if (type === 'feat') {
    return 'minor';
  }

  // fix, perf = patch version bump
  if (type === 'fix' || type === 'perf') {
    return 'patch';
  }

  // docs, style, refactor, test, chore, ci, build = no version bump
  return 'none';
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: node validate-pr-title.js "<PR title>" [PR body]');
    console.error('\nExample:');
    console.error('  node validate-pr-title.js "feat: add new feature"');
    process.exit(1);
  }

  const title = args[0];
  const body = args[1] || '';

  const result = validatePRTitle(title);

  if (!result.valid) {
    console.error('❌ Invalid PR title\n');
    console.error(result.error);
    process.exit(1);
  }

  const bump = determineVersionBump(title, body);

  console.log('✅ Valid PR title\n');
  console.log(`Type: ${result.type}`);
  if (result.scope) {
    console.log(`Scope: ${result.scope}`);
  }
  console.log(`Breaking: ${result.breaking ? 'Yes' : 'No'}`);
  console.log(`Version bump: ${bump}`);
  console.log(`Description: ${result.description}`);

  process.exit(0);
}

module.exports = {
  validatePRTitle,
  determineVersionBump,
  VALID_TYPES,
};
