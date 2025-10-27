# License Compliance Policy

## Overview

MyDBA maintains strict license compliance to ensure all dependencies are compatible with commercial and open-source distribution. This document outlines our license policy and compliance procedures.

## Allowed Licenses

The following licenses are approved for use in MyDBA:

### Permissive Open Source Licenses
- **MIT License** - Most permissive, allows commercial use
- **Apache License 2.0** - Permissive with patent grant
- **BSD 2-Clause License** - Simple permissive license
- **BSD 3-Clause License** - BSD with advertising clause
- **ISC License** - Functionally equivalent to MIT
- **0BSD License** - Public domain equivalent
- **CC0 1.0 Universal** - Public domain dedication
- **Python Software Foundation License 2.0** - Permissive for Python packages
- **BlueOak-1.0.0** - Modern permissive license

## Disallowed Licenses

The following licenses are **NOT allowed** due to copyleft requirements or restrictive terms:

### Copyleft Licenses (Viral)
- **GPL (all versions)** - Requires derivative works to use GPL
- **AGPL (all versions)** - GPL with network copyleft
- **LGPL (all versions)** - Library GPL, still has copyleft requirements
- **SSPL (Server Side Public License)** - Restrictive copyleft for SaaS

### Restrictive Licenses
- **CC-BY-NC (Creative Commons Non-Commercial)** - Prohibits commercial use
- **CC-BY-NC-SA** - Non-commercial with share-alike
- **Unlicense** - Public domain may have legal ambiguity in some jurisdictions

## Automated License Checking

### CI/CD Integration

Every pull request and commit is automatically checked for license compliance:

1. **License Check Workflow** (`.github/workflows/license-check.yml`)
   - Runs on every PR and push to main/develop
   - Runs weekly to catch new dependency issues
   - Fails build if disallowed licenses are found

2. **License Reports**
   - JSON report: Full dependency tree with licenses
   - CSV report: Tabular format for spreadsheet analysis
   - Markdown report: Human-readable attribution document
   - Retention: 90 days for reports, 365 days for attribution

### Local License Checking

Developers can check licenses locally before committing:

```bash
# Quick summary of all licenses
npm run license:check

# Generate detailed reports
npm run license:report

# Verify no disallowed licenses (same as CI)
npm run license:verify
```

## Compliance Workflow

### Adding New Dependencies

Before adding a new dependency:

1. **Check the license:**
   ```bash
   npm info <package-name> license
   ```

2. **Verify it's allowed:**
   - Cross-reference with [Allowed Licenses](#allowed-licenses)
   - If unsure, check on [choosealicense.com](https://choosealicense.com/)

3. **Run local verification:**
   ```bash
   npm install <package-name>
   npm run license:verify
   ```

4. **Document exceptional cases:**
   - If a package has multiple licenses, document which one applies
   - If unsure about compatibility, open an issue for review

### Handling License Violations

If CI detects a disallowed license:

1. **Review the violation:**
   - Check the license-summary artifact in GitHub Actions
   - Identify which dependency introduced the violation

2. **Choose a remediation:**
   - **Option A:** Find an alternative package with compatible license
   - **Option B:** Request an exception (document business justification)
   - **Option C:** Implement the functionality internally

3. **Update and retest:**
   ```bash
   npm run license:verify
   ```

### Exception Process

In rare cases, an exception may be granted:

1. **Create an issue** with:
   - Package name and version
   - License in question
   - Business justification for exception
   - Legal review (if applicable)

2. **Document the exception:**
   - Add to `.licensecheckrc.json` excludePackages
   - Update this document with rationale

3. **Re-evaluate regularly:**
   - Review exceptions quarterly
   - Look for compatible alternatives

## License Attribution

### Third-Party Licenses

MyDBA generates a `THIRD_PARTY_LICENSES.md` file containing all dependency licenses. This file:

- Is generated automatically in CI
- Is available as a CI artifact (365-day retention)
- Must be included in distribution packages
- Should be reviewed before releases

### Generating Attribution Locally

```bash
# Generate third-party license file
npx license-checker --markdown --out THIRD_PARTY_LICENSES.md
```

## Common License Questions

### Q: Can I use a package with dual licensing (e.g., MIT OR Apache-2.0)?
**A:** Yes, as long as at least one license is on the allowed list.

### Q: What if a package has no license information?
**A:** Packages without licenses should not be used. Contact the maintainer to add a license.

### Q: Can I vendor code from a GPL project?
**A:** No, not without additional approval and legal review. GPL is copyleft and requires derivative works to use GPL.

### Q: Are dev dependencies subject to the same rules?
**A:** Yes, all dependencies (including devDependencies) must comply with the license policy.

### Q: What about packages used only in tests?
**A:** Test dependencies follow the same rules, but exceptions may be more readily granted since they don't ship to end users.

## Enforcement

### Pre-commit Checks
- License checks run in CI for every commit
- Pull requests with violations cannot be merged
- Build fails if disallowed licenses are detected

### Regular Audits
- Weekly automated scans (Monday 00:00 UTC)
- Quarterly manual review of exceptions
- Annual comprehensive license audit

### Violations
Violations are automatically:
- Reported in CI logs
- Posted as PR comments
- Escalated to maintainers via GitHub issues

## Resources

### License Information
- [Choose a License](https://choosealicense.com/) - License comparison
- [TLDRLegal](https://tldrlegal.com/) - Plain English license explanations
- [SPDX License List](https://spdx.org/licenses/) - Standardized license identifiers
- [OSI Approved Licenses](https://opensource.org/licenses) - Open Source Initiative approved licenses

### Tools
- [license-checker](https://www.npmjs.com/package/license-checker) - npm license verification
- [FOSSA](https://fossa.com/) - Enterprise license compliance
- [Black Duck](https://www.blackducksoftware.com/) - License and security scanning

### Legal
For legal questions about licenses, consult your organization's legal counsel. This document provides guidance but is not legal advice.

---

## Summary

**Allowed:** MIT, Apache-2.0, BSD-2/3-Clause, ISC, 0BSD, CC0-1.0, Python-2.0
**Disallowed:** GPL, AGPL, LGPL, SSPL, CC-BY-NC (copyleft and restrictive)
**Process:** Automated CI checks + local verification + exception workflow
**Enforcement:** Build fails on violations, weekly audits, quarterly reviews

---

*Last Updated: October 27, 2025*
*Policy Version: 1.0*
