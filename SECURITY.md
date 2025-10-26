# Security Policy

## 🔒 Security at MyDBA

Security is a top priority for MyDBA. As a database management extension that handles credentials and sensitive data, we take security vulnerabilities seriously and are committed to addressing them promptly.

---

## 📋 Table of Contents

- [Supported Versions](#supported-versions)
- [Reporting a Vulnerability](#reporting-a-vulnerability)
- [Security Best Practices](#security-best-practices)
- [Known Security Considerations](#known-security-considerations)
- [Security Update Policy](#security-update-policy)
- [Hall of Fame](#hall-of-fame)

---

## Supported Versions

We provide security updates for the following versions:

| Version | Supported          | End of Support |
|---------|--------------------|----------------|
| 1.x.x (latest) | ✅ Fully supported | -              |
| 1.0.x   | ✅ Security fixes only | TBD            |
| 0.x.x (beta) | ❌ No longer supported | 2025-12-01     |

**Current Version**: Check the [Releases](https://github.com/yourusername/mydba/releases) page for the latest version.

**Recommendation**: Always use the latest stable version to benefit from the latest security patches.

### Database GA Support Policy

MyDBA supports only GA (Generally Available) database versions:

| Database | Supported |
|----------|-----------|
| MySQL | 8.0+, 8.4, 9.x+ |
| MariaDB | 10.6 LTS, 10.11 LTS, 11.x+ |

EOL versions such as MySQL 5.7 and MariaDB 10.4/10.5 are not supported. This policy reduces security risk and enables Performance Schema–based profiling recommended by MySQL.

### Cloud IAM Least-Privilege (AWS RDS/Aurora)

- Use `rds-db:connect` with scoped DB resource ARNs for IAM authentication.
- Optional: retrieval of secrets via AWS Secrets Manager requires only `secretsmanager:GetSecretValue` for specific ARNs.
- Do not grant wildcard privileges. Scope policies per environment and account.

### Dependency Hygiene

- Monthly dependency audit (`npm audit`, Snyk)
- Quarterly threat model review covering AI data flows, webviews, and database adapters

---

## Reporting a Vulnerability

### ⚠️ Please DO NOT Report Security Vulnerabilities Publicly

If you discover a security vulnerability, **do not** open a public GitHub issue. This helps protect users until a fix is available.

### How to Report

**Email**: security@mydba.dev

**PGP Key**: [Download public key](https://mydba.dev/security/pgp-key.asc) (optional, for encrypted communication)

### What to Include

Please provide as much information as possible to help us understand and reproduce the issue:

1. **Vulnerability Description**:
   - Type of vulnerability (e.g., credential leak, SQL injection, XSS)
   - Affected component(s)
   - Severity assessment (low, medium, high, critical)

2. **Steps to Reproduce**:
   - Detailed steps to reproduce the issue
   - Any special configuration required
   - Screenshots or video (if applicable)

3. **Impact Assessment**:
   - What data could be exposed?
   - What actions could an attacker perform?
   - Are there any prerequisites for exploitation?

4. **Proof of Concept** (if available):
   - Code snippet or sample exploit
   - Environment details (OS, VSCode version, MyDBA version)

5. **Suggested Fix** (optional):
   - If you have ideas on how to fix the issue

### Example Report

```
Subject: [SECURITY] Credential Exposure in Connection Config

Description:
Database credentials are logged in plaintext when connection fails
with debug logging enabled.

Steps to Reproduce:
1. Enable debug logging: "mydba.logging.level": "debug"
2. Attempt connection with invalid credentials
3. Check VSCode Output panel → MyDBA Debug
4. Credentials visible in log: "Failed to connect: user=admin, password=secret123"

Impact:
- Credentials exposed to anyone with access to VSCode logs
- Affects all users with debug logging enabled
- Severity: HIGH

Environment:
- MyDBA version: 1.0.0
- VSCode version: 1.85.0
- OS: macOS 14.0

Suggested Fix:
Mask password in error logs:
```typescript
logger.debug(`Failed to connect: user=${user}, password=***`);
```

Proof of Concept:
[Attached screenshot showing plaintext password in logs]
```

---

## Response Timeline

We are committed to addressing security issues promptly:

| Severity | First Response | Patch Target | Disclosure |
|----------|---------------|--------------|------------|
| **Critical** | < 24 hours | 7 days | After patch |
| **High** | < 48 hours | 14 days | After patch |
| **Medium** | < 1 week | 30 days | After patch |
| **Low** | < 2 weeks | 60 days | After patch |

**First Response**: Acknowledgment that we received your report
**Patch Target**: Goal for releasing a fix (may vary based on complexity)
**Disclosure**: When the vulnerability will be publicly disclosed

### What Happens Next?

1. **Acknowledgment** (within timeline above)
   - We confirm receipt of your report
   - Assign a tracking ID (e.g., `MYDBA-SEC-2025-001`)

2. **Triage** (1-3 days)
   - Assess severity and impact
   - Reproduce the vulnerability
   - Determine affected versions

3. **Fix Development** (varies by severity)
   - Develop and test a patch
   - Create a security advisory (private)
   - Coordinate release timing

4. **Release** (coordinated)
   - Release patch in a new version
   - Publish security advisory
   - Notify affected users

5. **Disclosure** (after patch available)
   - Publicly disclose the vulnerability
   - Credit the reporter (if desired)
   - Update this document if needed

---

## Security Best Practices

### For Users

#### 1. Credential Management

✅ **DO**:
- Use VSCode SecretStorage for credentials (automatic in MyDBA)
- Enable SSH tunneling for remote connections
- Use SSL/TLS for database connections
- Rotate credentials regularly
- Use read-only database users when possible

❌ **DON'T**:
- Store passwords in workspace settings
- Share connection profiles with credentials
- Commit connection configs to Git
- Use production credentials in development

#### 2. AI Features

✅ **DO**:
- Review the [Privacy Policy](docs/PRIVACY.md) before enabling AI
- Enable anonymization: `"mydba.ai.anonymizeData": true`
- Use `confirmBeforeSend` for sensitive environments
- Disable AI entirely for HIPAA/PCI-DSS data: `"mydba.ai.enabled": false`

❌ **DON'T**:
- Send production queries to AI without anonymization
- Include PII in queries when AI is enabled
- Use AI features on databases with regulated data (unless reviewed by compliance)

#### 3. Network Security

✅ **DO**:
- Verify SSL certificates: `"mydba.ssl.rejectUnauthorized": true`
- Use firewalls to restrict database access
- Monitor the network activity log: `View → Output → MyDBA - Network`
- Use VPN or SSH tunnels for remote databases

❌ **DON'T**:
- Disable SSL certificate validation in production
- Expose database ports to the public internet
- Ignore network activity warnings

#### 4. Extension Updates

✅ **DO**:
- Enable auto-updates in VSCode
- Review release notes for security fixes
- Update promptly when security patches are released
- Subscribe to security advisories

❌ **DON'T**:
- Ignore update notifications
- Pin to old versions without a reason
- Disable extension updates

---

### For Contributors

#### Code Security Guidelines

1. **Input Validation**
   - Validate all user input
   - Sanitize data before SQL queries (use parameterized queries)
   - Validate configuration values

2. **Credential Handling**
   - Never log credentials (even in debug mode)
   - Use VSCode SecretStorage API exclusively
   - Wipe credentials from memory after use
   - Never include credentials in error messages

3. **SQL Injection Prevention**
   - Use parameterized queries (prepared statements)
   - Never concatenate user input into SQL
   - Validate table/column names against schema

   **Good**:
   ```typescript
   const result = await connection.query(
     'SELECT * FROM users WHERE id = ?',
     [userId]
   );
   ```

   **Bad**:
   ```typescript
   const result = await connection.query(
     `SELECT * FROM users WHERE id = ${userId}`  // ❌ SQL injection risk
   );
   ```

4. **Dependency Management**
   - Run `npm audit` before every PR
   - Keep dependencies up-to-date
   - Avoid dependencies with known vulnerabilities
   - Use Snyk or similar tools for scanning

5. **Secrets in Code**
   - Never commit API keys, tokens, or credentials
   - Use `.gitignore` for sensitive files
   - Scan commits with `git-secrets` or similar tools

6. **Webview Security**
   - Use Content Security Policy (CSP)
   - Sanitize HTML content
   - Avoid `eval()` or dynamic code execution
   - Validate all messages from webviews

---

## Known Security Considerations

### 1. VSCode Extension Permissions

MyDBA requires the following VSCode permissions:

| Permission | Why Needed | Risk Level |
|------------|------------|------------|
| **Network Access** | Connect to databases, AI API | Medium |
| **SecretStorage** | Store credentials securely | Low (OS-protected) |
| **Workspace Files** | Read connection configs | Low |
| **Output Panel** | Log network activity | Low |

**Mitigation**: All permissions are necessary for core functionality and follow VSCode best practices.

### 2. AI Data Transmission

When AI features are enabled, query structure is sent to VSCode Language Model API.

**What's Sent**: Templated queries (e.g., `SELECT * FROM <table:users> WHERE <col:id> = ?`)
**What's NOT Sent**: Actual data values, credentials, query results

**Mitigation**:
- AI disabled by default (opt-in)
- Query templating protects sensitive values
- Users can disable: `"mydba.ai.enabled": false`
- Full details in [Privacy Policy](docs/PRIVACY.md)

### 3. Database Credentials

Credentials are stored using VSCode SecretStorage API, which uses OS-level encryption:

- **macOS**: Keychain
- **Windows**: Credential Manager
- **Linux**: Secret Service API (libsecret)

**Risk**: If an attacker has access to your OS user account, they may access stored credentials.

**Mitigation**:
- Use OS-level security (FileVault, BitLocker, etc.)
- Use strong OS passwords
- Lock your computer when away
- Rotate credentials regularly

### 4. SSH Tunneling

MyDBA supports SSH tunneling, which requires SSH private keys.

**Risk**: SSH keys are stored in SecretStorage but are loaded into memory during connection.

**Mitigation**:
- Use passphrase-protected SSH keys
- Use SSH key agents when possible
- Rotate SSH keys regularly
- Limit SSH key permissions on servers

### 5. Query Result Data

Query results are displayed in VSCode webviews and stored in memory.

**Risk**: Query results may contain sensitive data visible in the UI.

**Mitigation**:
- Sensitive column warnings: `"mydba.security.warnSensitiveColumns": true`
- Auto-redaction: `"mydba.security.redactSensitiveColumns": true`
- Results never sent to AI
- Use read-only database users when possible

---

## Security Update Policy

### Severity Levels

We classify security vulnerabilities using the following criteria:

#### Critical (CVSS 9.0-10.0)
- Credential exposure (plaintext passwords leaked)
- SQL injection leading to data breach
- Remote code execution
- Privilege escalation

**Response**: Immediate hotfix, emergency release

#### High (CVSS 7.0-8.9)
- Authentication bypass
- Sensitive data exposure (PII, query results)
- Cross-site scripting (XSS) in webviews
- Denial of service (DoS)

**Response**: Priority fix, release within 14 days

#### Medium (CVSS 4.0-6.9)
- Information disclosure (schema details)
- Unvalidated input leading to crashes
- Missing security headers
- Weak encryption

**Response**: Scheduled fix, release within 30 days

#### Low (CVSS 0.1-3.9)
- Minor information leaks
- Non-exploitable bugs
- Hardening opportunities

**Response**: Addressed in regular releases

### CVE Assignment

For vulnerabilities affecting multiple users, we may request a CVE (Common Vulnerabilities and Exposures) identifier from GitHub Security Lab.

---

## Security Audits

### Internal Audits

We perform regular security audits:

- **Code Reviews**: All PRs reviewed for security issues
- **Dependency Scans**: Weekly `npm audit` and Snyk scans
- **Penetration Testing**: Quarterly internal security testing
- **Privacy Review**: Annual privacy policy and data flow review

### External Audits

We welcome security researchers and may engage third-party security firms for audits.

**Interested in auditing?** Contact security@mydba.dev

---

## Disclosure Policy

### Coordinated Disclosure

We follow **Coordinated Vulnerability Disclosure** (CVD):

1. **Private Disclosure**: Reporter contacts us privately
2. **Acknowledgment**: We confirm receipt and begin triage
3. **Fix Development**: We develop and test a patch
4. **Coordinated Release**: We coordinate release timing with reporter
5. **Public Disclosure**: Vulnerability disclosed after patch is available

### Public Disclosure Timeline

- **90 days** after report (if no fix yet, we may disclose early with mitigation advice)
- **Immediately** after patch is released (preferred)
- **Earlier** if vulnerability is being actively exploited

### Security Advisories

Published at: https://github.com/yourusername/mydba/security/advisories

---

## Hall of Fame

We recognize security researchers who responsibly disclose vulnerabilities:

| Researcher | Vulnerability | Severity | Date |
|------------|---------------|----------|------|
| *No reports yet* | - | - | - |

**Want to be listed?** Report a valid security vulnerability and let us know if you'd like to be credited!

---

## Contact

**Security Email**: security@mydba.dev
**PGP Key**: [Download](https://mydba.dev/security/pgp-key.asc)
**Response Time**: < 48 hours for high/critical issues

**GitHub Security Advisories**: https://github.com/yourusername/mydba/security/advisories

---

## Legal

### Responsible Disclosure

We will not pursue legal action against security researchers who:

- Report vulnerabilities responsibly and privately
- Allow reasonable time for a fix before public disclosure
- Do not exploit the vulnerability beyond proof-of-concept
- Do not access, modify, or delete user data without permission
- Act in good faith to improve MyDBA security

### Bug Bounty

We currently do not offer a bug bounty program, but we:

- Acknowledge and credit reporters (with permission)
- Feature reporters in our Hall of Fame
- Provide swag for significant findings (when available)
- Consider monetary rewards for critical vulnerabilities on a case-by-case basis

---

## Additional Resources

- **Privacy Policy**: [docs/PRIVACY.md](docs/PRIVACY.md)
- **Contributing Guidelines**: [CONTRIBUTING.md](CONTRIBUTING.md)
- **Code of Conduct**: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) *(coming soon)*
- **VSCode Extension Security**: https://code.visualstudio.com/api/references/extension-guidelines#security

---

**Last Updated**: October 25, 2025
**Version**: 1.0

Thank you for helping keep MyDBA and its users safe! 🔒
