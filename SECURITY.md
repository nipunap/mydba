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

| Version | Status | Security Fixes Until | Full Support Until |
|---------|--------|---------------------|-------------------|
| 1.0.x (beta) | ✅ Current | TBD (targeting GA Q1 2026) | TBD |
| 0.x.x (alpha) | ❌ EOL | 2025-11-30 | 2025-09-30 |

**Current Version**: 1.0.0-beta.1 ([Releases](https://github.com/nipunap/mydba/releases))

**Support Policy**: After GA release, the last 2 minor versions will receive security fixes for 6 months after the next release.

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

**Email**: nipunap@gmail.com

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

## Security Incident Response

### If You Suspect Your Data Was Compromised

If you believe your database credentials, API keys, or other sensitive data was exposed through MyDBA, follow these steps immediately.

#### Immediate Actions (Within 1 Hour)

1. **Disconnect All Connections**
   - Close VSCode
   - Terminate all active database connections
   - Stop any running MyDBA processes

2. **Rotate All Credentials**
   - Change database passwords immediately
   - Rotate SSH keys
   - Regenerate AI API keys
   - Update AWS IAM credentials (if used)

3. **Revoke Access**
   - Revoke old credentials from database servers
   - Update firewall rules if needed
   - Check database access logs for suspicious activity

4. **Assess Scope**
   - Identify which connections were potentially compromised
   - Review recent connection activity
   - Check for unauthorized database access

#### Evidence Collection (For Reporting)

Collect the following information before uninstalling or making changes:

1. **VSCode Logs**
   - Open: Help → Toggle Developer Tools → Console
   - Copy all console output
   - Save Console logs to a file

2. **MyDBA Logs**
   - View → Output → Select "MyDBA" from dropdown
   - Copy all log output
   - Check for unusual network activity

3. **Network Activity**
   - View → Output → Select "MyDBA - Network" (if enabled)
   - Review recent connections and API calls
   - Note any unexpected destinations

4. **Extension List**
   - Extensions → ... → Show Installed Extensions
   - Screenshot or list all installed extensions
   - Check for suspicious or recently installed extensions

5. **Recent Changes**
   - Review recent extension updates
   - Check VSCode settings changes
   - Review workspace settings (`.vscode/settings.json`)

6. **System Information**
   - MyDBA version: Extensions → MyDBA → Version
   - VSCode version: Help → About
   - OS version and last update date

#### Report to Us

After securing your systems, please report the incident:

**Email**: nipunap@gmail.com

**Subject**: [INCIDENT] Security Incident Report

**Include**:
- Brief description of what happened
- Timeline of events
- Evidence collected (attach logs)
- Actions you've already taken
- Impact assessment

### We Will Respond With

1. **Immediate Acknowledgment** (< 24 hours)
   - Confirm receipt of your report
   - Assign an incident ID
   - Request additional information if needed

2. **Investigation** (24-48 hours)
   - Analyze logs and evidence
   - Identify root cause
   - Determine if other users are affected

3. **Mitigation Guidance** (48-72 hours)
   - Provide specific remediation steps
   - Recommend additional security measures
   - Advise on monitoring for suspicious activity

4. **Follow-Up Actions**
   - Issue security advisory if needed
   - Release patch or hotfix if vulnerability found
   - Update security documentation
   - Notify other affected users if applicable

### Prevention Checklist

To reduce the risk of future incidents:

- ✅ Keep MyDBA and VSCode updated
- ✅ Review installed extensions regularly
- ✅ Enable OS-level disk encryption
- ✅ Use strong, unique passwords
- ✅ Enable 2FA on database accounts (if supported)
- ✅ Rotate credentials quarterly
- ✅ Monitor database access logs
- ✅ Use read-only accounts when possible
- ✅ Disable AI for production databases with sensitive data
- ✅ Review VSCode settings for suspicious changes

### Common Incident Scenarios

#### Scenario 1: Credentials Exposed in Logs
**Symptom**: You found a password in log output
**Action**: Rotate credentials immediately, report to nipunap@gmail.com
**Prevention**: Update to latest version (older versions had debug logging issues)

#### Scenario 2: Suspicious Database Access
**Symptom**: Database logs show unauthorized queries from your IP
**Action**: Revoke credentials, check for malware, report incident
**Prevention**: Enable network activity monitoring, use SSH tunneling

#### Scenario 3: Malicious Extension
**Symptom**: Another extension may have accessed MyDBA's stored credentials
**Action**: Uninstall suspicious extension, rotate all credentials
**Prevention**: Only install trusted extensions, review permissions

#### Scenario 4: Lost or Stolen Laptop
**Symptom**: Device with active MyDBA connections is lost/stolen
**Action**: Rotate all database credentials immediately, report to IT/security team
**Prevention**: Use OS-level encryption, lock screen when away

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
- Review the AI data handling section in this document before enabling AI
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

#### 5. Development Environment Security

When using MyDBA with test databases (e.g., `docker-compose.test.yml`):

✅ **DO**:
- Use non-root database users in containers
- Keep test data separate from production
- Rotate test credentials regularly
- Use `.env` files for secrets (gitignored)
- Stop containers when not in use
- Use specific version tags (not `latest`)

❌ **DON'T**:
- Use production credentials in Docker containers
- Expose database ports to 0.0.0.0 unnecessarily
- Commit database credentials to Git
- Share test environments without sanitizing data
- Use default passwords (mysql root/password)

**Docker Security Example**:
```yaml
# docker-compose.test.yml
services:
  mysql-test:
    image: mysql:8.0.35  # Specific version, not 'latest'
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_ROOT_PASSWORD}  # From .env file
      MYSQL_USER: testuser  # Non-root user
      MYSQL_PASSWORD: ${DB_PASSWORD}
    ports:
      - "127.0.0.1:3306:3306"  # Bind to localhost only
    command: --default-authentication-plugin=mysql_native_password
```

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

   **Good** (Parameterized Query):
   ```typescript
   const result = await connection.query(
     'SELECT * FROM users WHERE id = ?',
     [userId]
   );
   ```

   **Bad** (SQL Injection Risk):
   ```typescript
   const result = await connection.query(
     `SELECT * FROM users WHERE id = ${userId}`  // ❌ SQL injection risk
   );
   ```

   **Schema Validation** (Prevent Table Name Injection):
   ```typescript
   // Validate table names against allowed list
   const ALLOWED_TABLES = ['users', 'posts', 'comments', 'sessions'];

   function validateTableName(tableName: string): void {
     if (!ALLOWED_TABLES.includes(tableName)) {
       throw new Error(`Invalid table name: ${tableName}`);
     }
   }

   // Use in queries
   validateTableName(userProvidedTable);
   const result = await connection.query(
     `SELECT * FROM ${userProvidedTable} WHERE id = ?`,
     [userId]
   );
   ```

   **Column Name Validation**:
   ```typescript
   // Validate against schema
   async function validateColumn(table: string, column: string): Promise<boolean> {
     const schema = await getTableSchema(table);
     return schema.columns.includes(column);
   }
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

When AI features are enabled, query structure may be sent to configured AI providers for analysis.

#### Supported AI Providers

MyDBA supports multiple AI providers (configured via `mydba.ai.provider`):

1. **VSCode Language Model API** (default, auto-detected)
   - Includes GitHub Copilot, OpenAI, Anthropic via VSCode
   - Subject to VSCode and provider terms

2. **OpenAI** (GPT-4o-mini default)
   - Requires API key
   - Direct API communication

3. **Anthropic** (Claude 3.5 Sonnet default)
   - Requires API key
   - Direct API communication

4. **Ollama** (Local)
   - Runs entirely on your machine
   - No external data transmission

#### What Data Is Sent

**Default Configuration** (`mydba.ai.anonymizeQueries: true`):
- Query structure with templated values: `SELECT * FROM <table:users> WHERE <col:id> = ?`
- Table/column names (schema metadata) if `includeSchemaContext: true`
- Query execution plans (EXPLAIN output)

**What's NEVER Sent**:
- Actual data values from query results
- Database credentials (passwords, tokens)
- Connection details (hosts, ports, usernames)
- SSH keys or passphrases

#### Data Retention & Processing

- **VSCode LM API**: Subject to provider's data retention policy (GitHub/OpenAI/Anthropic)
- **Direct API Calls**: Subject to OpenAI/Anthropic data retention policies
- **Ollama**: Data never leaves your machine
- **Regional Processing**: May involve cross-border data transfer depending on provider
- **Audit Trail**: All AI requests logged locally in VSCode Output panel (if `network.showActivityLog: true`)

#### Configuration & Control

**AI is enabled by default but requires provider configuration on first use.**

Disable AI entirely:
```json
"mydba.ai.enabled": false
```

Require confirmation before sending:
```json
"mydba.ai.confirmBeforeSend": true
```

Disable schema context:
```json
"mydba.ai.includeSchemaContext": false
```

#### Compliance Implications

- **GDPR**: AI processing may constitute data transfer outside EU - review provider DPAs
- **HIPAA**: Not HIPAA-compliant - disable AI for PHI databases
- **PCI-DSS**: Not certified - do not use on payment card databases without additional controls
- **Best Practice**: Disable AI in production environments with regulated data

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

MyDBA supports SSH tunneling for secure remote database connections.

#### SSH Key Storage

**Storage Method**:
- Full SSH private key content is stored in VSCode SecretStorage (encrypted at rest)
- Stored as `mydba.connection.<connectionId>.sshKey`
- OS-level encryption (Keychain/Credential Manager/libsecret)

**Memory Handling**:
- Private keys loaded into memory only during active connection
- Keys cleared from memory when connection is closed
- No disk caching of unencrypted keys

**Risk**: If an attacker gains access to your OS user account, they may extract SSH keys from SecretStorage.

**Mitigation**:
- Use passphrase-protected SSH keys (passphrase stored separately in SecretStorage)
- Use SSH key agents when possible (reduces key exposure)
- Rotate SSH keys regularly (quarterly recommended)
- Limit SSH key permissions on servers (restrict to specific IPs/commands)
- Enable OS-level security (FileVault, BitLocker, disk encryption)

### 5. Query Result Data

Query results are displayed in VSCode webviews and stored in memory.

**Risk**: Query results may contain sensitive data visible in the UI.

**Mitigation**:
- Sensitive column warnings: `"mydba.security.warnSensitiveColumns": true`
- Auto-redaction: `"mydba.security.redactSensitiveColumns": true`
- Results never sent to AI
- Use read-only database users when possible

### 6. Resource Limits & Rate Limiting

MyDBA implements several resource limits to prevent accidental damage and resource exhaustion.

#### Query Limits

**Result Set Limits**:
- Preview queries: 1,000 rows max (`mydba.preview.maxRows`)
- Table data previews: 1,000 rows default
- Large result sets truncated with warning

**DML Operation Limits**:
- Max affected rows: 1,000 default (`mydba.dml.maxAffectRows`)
- Confirmation required when threshold exceeded
- Warning for UPDATE/DELETE without WHERE clause (`mydba.warnMissingWhereClause`)

**Query Execution**:
- Default timeout: 30 seconds (`mydba.queryTimeout`)
- Configurable per environment (dev/staging/prod)
- Long-running queries can be cancelled

#### Connection Limits

**Concurrent Connections**:
- Max concurrent connections: 10 default (`mydba.maxConnections`)
- Prevents connection pool exhaustion
- Alerts at 80% usage (`mydba.metrics.connectionUsageWarning`)

#### AI Rate Limiting

**Current Status**: No hard rate limits enforced
**Future Plans**: Rate limiting for AI API calls to prevent cost overruns
**Manual Control**: Disable AI or use `confirmBeforeSend` for granular control

#### Safety Features

- **Safe Mode**: Enabled by default (`mydba.safeMode`)
- **Dry Run Mode**: Preview queries without execution (`mydba.dryRunMode`)
- **Destructive Operation Confirmation**: Required for DROP/TRUNCATE/DELETE/UPDATE (`mydba.confirmDestructiveOperations`)

### 7. Extension Distribution & Updates

MyDBA is distributed exclusively through official channels to ensure integrity and authenticity.

#### Official Distribution Channels

✅ **Trusted Sources**:
- **VSCode Marketplace**: Primary distribution channel (marketplace.visualstudio.com)
- **Open VSX Registry**: Open-source alternative registry
- **GitHub Releases**: Source downloads and VSIX files (github.com/nipunap/mydba/releases)

⚠️ **Avoid**:
- Third-party extension repositories
- Unofficial mirrors or download sites
- Extensions with similar names (typosquatting)
- `.vsix` files from untrusted sources

#### Verification Steps

**Verify Publisher**:
1. Open Extensions panel in VSCode
2. Search for "MyDBA"
3. Check publisher: **NipunaPerera** (verified)
4. Verify description matches official documentation

**Check Signature** (VSCode Marketplace):
- All marketplace extensions are signed by Microsoft during publication
- VSCode automatically verifies signatures on install/update
- Manual verification not required for marketplace installs

**GitHub Release Verification**:
```bash
# Download from official releases
https://github.com/nipunap/mydba/releases

# Verify checksums (when available)
sha256sum mydba-1.0.0.vsix
# Compare with published checksum in release notes
```

#### Update Security

**Auto-Updates** (Recommended):
- VSCode checks for updates automatically
- Security patches released as patch versions (1.0.x)
- Critical fixes may be released as emergency updates

**Manual Updates**:
- Check GitHub releases: https://github.com/nipunap/mydba/releases
- Review CHANGELOG.md for security fixes
- Download from official sources only

**Security Update Notifications**:
- GitHub Security Advisories: https://github.com/nipunap/mydba/security/advisories
- Email notifications (if subscribed to repository)
- VSCode extension update notifications

#### Supply Chain Security

**Build & Release Process**:
- Automated builds via GitHub Actions
- Code signing during marketplace publication
- Dependency lock files (package-lock.json) committed
- Regular dependency audits (npm audit, Snyk)

**What We Do**:
- Monthly security dependency updates
- Automated vulnerability scanning
- Review all dependency updates
- Pin dependency versions

**What You Can Do**:
- Only install from official sources
- Keep extension auto-update enabled
- Report suspicious extension behavior
- Verify extension details before install

---

## Threat Model

This section provides an overview of MyDBA's threat model, including attack surfaces, trust boundaries, and mitigations.

### Attack Surface Analysis

#### 1. Database Connections
- **Risk**: Compromised credentials, SQL injection, unauthorized data access
- **Attack Vectors**: Credential theft, man-in-the-middle, connection hijacking
- **Mitigations**: SecretStorage encryption, SSL/TLS, parameterized queries, input validation

#### 2. VSCode Extension API
- **Risk**: Extension compromise, malicious updates, permission abuse
- **Attack Vectors**: Supply chain attacks, dependency vulnerabilities
- **Mitigations**: Code signing, dependency audits, minimal permissions, sandboxing

#### 3. Webviews
- **Risk**: XSS attacks, credential exposure, data leakage
- **Attack Vectors**: Malicious scripts, unsafe HTML rendering, postMessage exploits
- **Mitigations**: Content Security Policy, input sanitization, message validation

#### 4. AI API Communication
- **Risk**: Data exfiltration, prompt injection, API key theft
- **Attack Vectors**: Unencrypted transmission, oversharing context, credential leaks
- **Mitigations**: Query anonymization, schema filtering, HTTPS only, API key in SecretStorage

#### 5. Network Communication
- **Risk**: Data interception, certificate validation bypass
- **Attack Vectors**: MITM attacks, DNS spoofing, downgrade attacks
- **Mitigations**: TLS enforcement, certificate validation, SSH tunneling

### Trust Boundaries

```
┌─────────────────────────────────────────────────────┐
│                    User's Machine                    │
│  ┌────────────────────────────────────────────────┐ │
│  │              VSCode Process                     │ │
│  │  ┌──────────────────────────────────────────┐  │ │
│  │  │        MyDBA Extension                    │  │ │
│  │  │  • Business Logic (Trusted)              │  │ │
│  │  │  • Webviews (Semi-trusted)               │  │ │
│  │  └──────────────────────────────────────────┘  │ │
│  │            ↕ VSCode API                         │ │
│  │  ┌──────────────────────────────────────────┐  │ │
│  │  │    VSCode SecretStorage (Trusted)        │  │ │
│  │  └──────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────┘ │
│            ↕ OS Keychain (Trusted)                  │
└─────────────────────────────────────────────────────┘
              ↕ Network (Untrusted)
┌─────────────────────────────────────────────────────┐
│              External Services                       │
│  • Database Servers (Semi-trusted)                  │
│  • AI Providers (Untrusted)                         │
│  • SSH Servers (Semi-trusted)                       │
└─────────────────────────────────────────────────────┘
```

### Data Flow Diagram

**Query Execution Flow**:
1. User inputs query → Input validation
2. Query parsing → SQL injection checks
3. Credential retrieval → SecretStorage (encrypted)
4. Connection establishment → TLS/SSH tunnel
5. Query execution → Database server
6. Result retrieval → Row limit enforcement
7. Data sanitization → Sensitive column redaction
8. Display in webview → CSP protection

**AI Analysis Flow** (when enabled):
1. User requests AI analysis
2. Query anonymization → Template extraction
3. Schema context gathering (optional)
4. AI provider selection → Auto-detect or configured
5. API call → HTTPS to provider
6. Response parsing → Result display
7. Local logging → Audit trail

### Threat Categories & Mitigations

#### T1: Credential Theft
- **Threat**: Attacker steals database credentials
- **Mitigations**:
  - OS-level encryption (SecretStorage)
  - Never log credentials
  - Memory wiping after use
  - Regular rotation reminders

#### T2: SQL Injection
- **Threat**: Attacker injects malicious SQL
- **Mitigations**:
  - Parameterized queries only
  - Input validation
  - Schema validation
  - Query parsing and analysis

#### T3: Data Exfiltration via AI
- **Threat**: Sensitive data sent to AI providers
- **Mitigations**:
  - Query anonymization (default on)
  - No result data sent to AI
  - Confirmation prompts
  - Local-only option (Ollama)

#### T4: Man-in-the-Middle Attacks
- **Threat**: Network traffic intercepted
- **Mitigations**:
  - TLS/SSL required
  - Certificate validation
  - SSH tunneling support
  - Network activity logging

#### T5: Malicious Webview Content
- **Threat**: XSS or malicious scripts in webviews
- **Mitigations**:
  - Content Security Policy (strict)
  - HTML sanitization
  - Message validation
  - No eval() or inline scripts

#### T6: Supply Chain Attacks
- **Threat**: Compromised dependencies
- **Mitigations**:
  - Monthly npm audit
  - Snyk scanning
  - Minimal dependencies
  - Lock file verification

#### T7: Privilege Escalation
- **Threat**: Extension gains unauthorized access
- **Mitigations**:
  - Minimal VSCode permissions
  - Read-only database users recommended
  - Safe mode by default
  - Confirmation for destructive operations

---

## Security Update Policy

### Severity Levels

We classify security vulnerabilities using the following criteria based on **CVSS v3.1** scoring:

**CVSS Calculator**: https://www.first.org/cvss/calculator/3.1

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

## Compliance Considerations

MyDBA processes database metadata and query structures. Depending on your regulatory requirements, additional controls may be necessary.

### GDPR (General Data Protection Regulation)

**Scope**: EU data protection law

**MyDBA's Role**:
- **Data Processor**: When AI features are enabled, MyDBA processes query metadata
- **Data Controller**: Users are data controllers for their database connections

**Key Considerations**:
- AI features may transfer query structure to providers outside the EU
- Schema metadata (table/column names) may be shared with AI providers
- No personal data from query results is sent to AI (results stay local)

**Compliance Actions**:
- Review AI provider Data Processing Agreements (DPAs)
- Disable AI if operating under strict GDPR requirements: `"mydba.ai.enabled": false`
- Use Ollama (local AI) for EU data residency requirements
- Document data flows in your processing records

**Article 28 Requirements**: If using AI providers, ensure they meet GDPR processor requirements

### HIPAA (Health Insurance Portability and Accountability Act)

**Scope**: US healthcare data protection

**Status**: ⚠️ **MyDBA is NOT HIPAA-compliant**

**Restrictions**:
- **Do NOT** enable AI features when working with PHI (Protected Health Information)
- **Do NOT** use MyDBA on databases containing ePHI without a Business Associate Agreement
- VSCode SecretStorage is not certified for HIPAA compliance

**Safe Usage with PHI**:
```json
{
  "mydba.ai.enabled": false,
  "mydba.security.redactSensitiveColumns": true,
  "mydba.telemetry.enabled": false
}
```

**Recommendation**: Use MyDBA only for development/testing environments, not production PHI databases

### PCI-DSS (Payment Card Industry Data Security Standard)

**Scope**: Payment card data protection

**Status**: ⚠️ **MyDBA is NOT PCI-DSS certified**

**Restrictions**:
- **Do NOT** use on databases containing cardholder data (CHD) without additional controls
- **Do NOT** enable AI features on PCI scope databases
- Database connections must use TLS 1.2+ (configure at database level)

**Additional Controls Required**:
- Dedicated connection profiles for PCI environments
- Audit logging of all queries (enable VSCode logging)
- Read-only database users where possible
- Network segmentation (SSH tunneling recommended)

**Compliance Mapping**:
- PCI-DSS 3.4: Credential encryption (SecretStorage meets requirement)
- PCI-DSS 4.1: Strong cryptography (TLS 1.2+ required at DB level)
- PCI-DSS 10.2: Audit trails (VSCode Output panel logs)

### SOC 2 (Service Organization Control)

**Status**: MyDBA is a client-side extension with no hosted services

**SOC 2 Report**: Not available (N/A for client-side software)

**Trust Services Criteria**:
- **Security**: Covered by this security policy
- **Availability**: User-managed (VSCode extension)
- **Processing Integrity**: Query validation and limits
- **Confidentiality**: SecretStorage encryption
- **Privacy**: No data collection without consent (telemetry opt-in)

**For Enterprise Customers**:
- No SaaS component, no SOC 2 audit needed
- Review AI provider SOC 2 reports if using external AI
- Document extension in your system inventory

### ISO 27001 & Other Standards

**ISO 27001**: This security policy and threat model support ISO 27001 compliance
**NIST Cybersecurity Framework**: Aligns with Identify, Protect, Detect, Respond, Recover functions
**CIS Controls**: Implements secure configuration (CIS Control 4), data protection (CIS Control 3)

### Compliance Summary Table

| Regulation | Status | Recommended Action |
|------------|--------|-------------------|
| **GDPR** | ⚠️ Partially compliant | Disable AI or use Ollama for EU data |
| **HIPAA** | ❌ Not compliant | Disable AI, use only in dev/test |
| **PCI-DSS** | ❌ Not certified | Additional controls required |
| **SOC 2** | N/A (client-side) | Review AI provider SOC 2 reports |
| **ISO 27001** | ✅ Supports compliance | Follow security best practices |

### Compliance Recommendations

1. **Classify Your Environments**:
   - Development: All features enabled
   - Staging: AI with confirmation
   - Production (regulated): AI disabled

2. **Document Data Flows**:
   - Map what data MyDBA accesses
   - Document AI provider usage
   - Maintain audit trail

3. **Regular Reviews**:
   - Quarterly security configuration audit
   - Annual compliance assessment
   - Update documentation as needed

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

**Interested in auditing?** Contact nipunap@gmail.com

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

Published at: https://github.com/nipunap/mydba/security/advisories

---

## Hall of Fame

We recognize security researchers who responsibly disclose vulnerabilities:

| Researcher | Vulnerability | Severity | Date |
|------------|---------------|----------|------|
| *No reports yet* | - | - | - |

**Want to be listed?** Report a valid security vulnerability and let us know if you'd like to be credited!

---

## Contact

**Security Email**: nipunap@gmail.com
**Response Time**: < 48 hours for high/critical issues

**GitHub Security Advisories**: https://github.com/nipunap/mydba/security/advisories

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

We currently do not offer a formal bug bounty program, but we:

- Acknowledge and credit reporters (with permission)
- Feature reporters in our Hall of Fame
- Provide swag for significant findings (when available)
- Consider monetary rewards for critical vulnerabilities on a case-by-case basis

#### Scope

**In Scope** (Eligible for Credit):
- MyDBA extension source code (src/ directory)
- Credential storage mechanisms (SecretStorage usage)
- SQL injection vulnerabilities in query handling
- Cross-site scripting (XSS) in webviews
- Authentication bypass in database connections
- Sensitive data exposure (credentials, query results)
- Remote code execution vulnerabilities
- Path traversal or file access issues
- Privilege escalation within extension context
- Dependency vulnerabilities with exploitable impact
- AI data leakage (sending more than documented)
- Session hijacking or connection compromise

**Out of Scope** (Not Eligible):
- VSCode platform vulnerabilities → Report to Microsoft
- Database server vulnerabilities → Report to MySQL/MariaDB/PostgreSQL
- AI provider vulnerabilities → Report to OpenAI/Anthropic/etc.
- Social engineering attacks
- Physical access attacks
- Denial of Service requiring > 100 requests/sec
- Issues requiring malicious extensions to be pre-installed
- Self-XSS with no security impact
- Clickjacking with minimal impact
- Issues in development/test dependencies only
- Known issues already in GitHub Issues
- Theoretical vulnerabilities without proof of concept

#### Testing Guidelines

**Allowed**:
- Test on your own systems and databases
- Use docker-compose.test.yml for local testing
- Static code analysis and automated scanning
- Creating proof-of-concept exploits (non-destructive)

**Not Allowed**:
- Testing on production systems without permission
- Accessing other users' data
- Denial of service attacks
- Social engineering of maintainers or users
- Physical security testing

#### Rewards & Recognition

**Hall of Fame**: All validated reports receive public credit (if desired)

**Swag**: Significant findings may qualify for MyDBA merchandise

**Monetary Rewards** (Critical Only):
- Critical vulnerabilities: $50-$200 USD (case-by-case)
- Must be novel, significant impact, with working PoC
- Payment via GitHub Sponsors or PayPal

**Factors Considered**:
- Severity (CVSS score)
- Impact on users
- Quality of report
- Ease of exploitation
- Number of affected users

---

## Additional Resources

- **Contributing Guidelines**: [CONTRIBUTING.md](CONTRIBUTING.md)
- **Database Setup**: [docs/DATABASE_SETUP.md](docs/DATABASE_SETUP.md)
- **Quick Reference**: [docs/QUICK_REFERENCE.md](docs/QUICK_REFERENCE.md)
- **VSCode Extension Security**: https://code.visualstudio.com/api/references/extension-guidelines#security

---

**Last Updated**: October 25, 2025
**Version**: 1.0

Thank you for helping keep MyDBA and its users safe! 🔒
