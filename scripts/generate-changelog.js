#!/usr/bin/env node

/**
 * Generate Changelog Entry
 *
 * Generates formatted changelog entries from PR information
 */

const fs = require('fs');
const path = require('path');

/**
 * Parse conventional commit title into components
 * @param {string} title - PR title in conventional commit format
 * @returns {{type: string, scope?: string, breaking: boolean, description: string}}
 */
function parseConventionalCommit(title) {
  const regex = /^(feat|fix|docs|style|refactor|perf|test|chore|ci|build)(\(.+?\))?(!)?:\s*(.+)/;
  const match = title.match(regex);

  if (!match) {
    throw new Error(`Invalid conventional commit format: ${title}`);
  }

  const [, type, scope, breaking, description] = match;

  return {
    type,
    scope: scope ? scope.replace(/[()]/g, '') : undefined,
    breaking: !!breaking,
    description: description.trim(),
  };
}

/**
 * Map commit type to changelog section
 * @param {string} type - Commit type
 * @returns {string} - Changelog section name
 */
function getChangelogSection(type) {
  const sectionMap = {
    feat: 'Added',
    fix: 'Fixed',
    perf: 'Performance',
    docs: 'Documentation',
    style: 'Style',
    refactor: 'Changed',
    test: 'Testing',
    chore: 'Maintenance',
    ci: 'CI/CD',
    build: 'Build',
  };

  return sectionMap[type] || 'Changed';
}

/**
 * Generate a changelog entry for a PR
 * @param {Object} options
 * @param {string} options.title - PR title
 * @param {number} options.prNumber - PR number
 * @param {string} options.version - New version number
 * @param {string} options.date - Release date (YYYY-MM-DD)
 * @param {string} options.body - PR body (optional)
 * @param {string} options.repoUrl - Repository URL
 * @returns {string} - Formatted changelog entry
 */
function generateChangelogEntry({ title, prNumber, version, date, body = '', repoUrl = '' }) {
  const parsed = parseConventionalCommit(title);
  const section = getChangelogSection(parsed.type);

  // Check for breaking change
  const hasBreakingChange = parsed.breaking || body.includes('BREAKING CHANGE:');

  // Extract breaking change description if present
  let breakingDescription = '';
  if (body.includes('BREAKING CHANGE:')) {
    const match = body.match(/BREAKING CHANGE:\s*(.+?)(?:\n\n|\n*$)/s);
    if (match) {
      breakingDescription = match[1].trim();
    }
  }

  // Capitalize first letter of description
  const description = parsed.description.charAt(0).toUpperCase() + parsed.description.slice(1);

  // Build PR link
  const prLink = repoUrl ? `[#${prNumber}](${repoUrl}/pull/${prNumber})` : `#${prNumber}`;

  // Build entry
  let entry = `## [${version}] - ${date}\n\n`;

  if (hasBreakingChange) {
    entry += `### ⚠️ Breaking Changes\n\n`;
    if (breakingDescription) {
      entry += `- ${breakingDescription} (${prLink})\n\n`;
    } else {
      entry += `- ${description} (${prLink})\n\n`;
    }
  }

  entry += `### ${section}\n\n`;
  entry += `- ${description}`;

  if (parsed.scope) {
    entry += ` [${parsed.scope}]`;
  }

  entry += ` (${prLink})\n`;

  return entry;
}

/**
 * Insert changelog entry into CHANGELOG.md
 * @param {string} entry - Formatted changelog entry
 * @param {string} changelogPath - Path to CHANGELOG.md
 * @returns {void}
 */
function insertIntoChangelog(entry, changelogPath) {
  if (!fs.existsSync(changelogPath)) {
    throw new Error(`CHANGELOG.md not found at ${changelogPath}`);
  }

  const content = fs.readFileSync(changelogPath, 'utf8');

  // Find the insertion point (after the header and before the first version)
  // Look for the pattern "## [" which marks version sections
  const versionRegex = /^## \[/m;
  const match = content.match(versionRegex);

  if (!match) {
    // No versions yet, insert after header
    const lines = content.split('\n');
    let insertIndex = 0;

    // Skip header lines (title, description, etc.)
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '' && i > 0) {
        insertIndex = i + 1;
        break;
      }
    }

    const newContent = [
      ...lines.slice(0, insertIndex),
      entry,
      '',
      ...lines.slice(insertIndex),
    ].join('\n');

    fs.writeFileSync(changelogPath, newContent, 'utf8');
    return;
  }

  // Insert before the first version
  const insertIndex = match.index;
  const newContent = [
    content.slice(0, insertIndex),
    entry,
    '\n',
    content.slice(insertIndex),
  ].join('');

  fs.writeFileSync(changelogPath, newContent, 'utf8');
}

/**
 * Preview changelog entry without writing
 * @param {Object} options - Same as generateChangelogEntry
 * @returns {string} - Preview text
 */
function previewChangelog(options) {
  const entry = generateChangelogEntry(options);
  return `\n📝 Changelog Preview:\n\n${entry}\n`;
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'preview') {
    // Preview mode
    const title = args[1] || process.env.PR_TITLE;
    const prNumber = args[2] || process.env.PR_NUMBER;
    const version = args[3] || process.env.NEW_VERSION || '1.0.0';
    const date = new Date().toISOString().split('T')[0];

    if (!title || !prNumber) {
      console.error('Usage: node generate-changelog.js preview "<PR title>" <PR number> [version]');
      console.error('\nOr set environment variables: PR_TITLE, PR_NUMBER, NEW_VERSION');
      process.exit(1);
    }

    try {
      const preview = previewChangelog({
        title,
        prNumber: parseInt(prNumber, 10),
        version,
        date,
      });
      console.log(preview);
      process.exit(0);
    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  } else if (command === 'insert') {
    // Insert mode
    const title = args[1] || process.env.PR_TITLE;
    const prNumber = args[2] || process.env.PR_NUMBER;
    const version = args[3] || process.env.NEW_VERSION;
    const changelogPath = args[4] || path.join(process.cwd(), 'CHANGELOG.md');
    const date = new Date().toISOString().split('T')[0];
    const body = process.env.PR_BODY || '';
    const repoUrl = process.env.REPO_URL || '';

    if (!title || !prNumber || !version) {
      console.error('Usage: node generate-changelog.js insert "<PR title>" <PR number> <version> [changelog-path]');
      console.error('\nOr set environment variables: PR_TITLE, PR_NUMBER, NEW_VERSION, REPO_URL, PR_BODY');
      process.exit(1);
    }

    try {
      const entry = generateChangelogEntry({
        title,
        prNumber: parseInt(prNumber, 10),
        version,
        date,
        body,
        repoUrl,
      });

      insertIntoChangelog(entry, changelogPath);
      console.log(`✅ Changelog updated successfully`);
      console.log(`\n${entry}`);
      process.exit(0);
    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  } else {
    console.error('Usage: node generate-changelog.js <command> [options]');
    console.error('\nCommands:');
    console.error('  preview  - Preview changelog entry without writing');
    console.error('  insert   - Insert changelog entry into CHANGELOG.md');
    console.error('\nExamples:');
    console.error('  node generate-changelog.js preview "feat: add cache" 123 1.1.0');
    console.error('  node generate-changelog.js insert "fix: bug" 124 1.0.1');
    process.exit(1);
  }
}

module.exports = {
  parseConventionalCommit,
  generateChangelogEntry,
  insertIntoChangelog,
  previewChangelog,
  getChangelogSection,
};
