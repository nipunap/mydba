# MyDBA Privacy & Security Policy

**Last Updated**: October 25, 2025
**Extension Version**: 1.0.0-alpha
**Document Version**: 1.0

---

## 🔒 Privacy Philosophy

MyDBA is designed with **privacy-first, local-first architecture**. Your database data stays on your machine unless you explicitly enable AI features that require external API calls.

### Core Principles

1. ✅ **Local-First**: All core database features work offline without network calls
2. ✅ **Explicit Consent**: AI features disabled by default; requires opt-in
3. ✅ **Minimal Data**: Send only query structure to AI, never actual data
4. ✅ **User Control**: Every network call can be disabled or reviewed
5. ✅ **Transparency**: All network activity logged and visible
6. ✅ **Encryption**: Credentials encrypted at rest, all network calls over TLS

---

## 📊 What Data Stays Local vs. What Gets Transmitted

### ✅ Stays Local (Never Leaves Your Machine)

| Data Type | Storage Location | Encryption |
|-----------|------------------|------------|
| Database credentials (passwords, SSH keys) | VSCode SecretStorage (OS keychain) | ✅ Encrypted |
| Query execution results | VSCode webview memory | N/A (in-memory) |
| Database schema metadata | Extension cache | ❌ Not needed (no PII) |
| Performance metrics (PROCESSLIST, variables) | Local display only | N/A |
| User-created custom views/queries | Workspace settings | ❌ Not needed |
| Extension configuration | VSCode settings | ❌ Not needed |
| Documentation bundles | Embedded in extension | N/A |

**Total Local Storage**: ~10-50MB (configuration + cache)

---

### ⚠️ Network Transmission (Only When AI Enabled)

MyDBA **only** sends data over the network when you:
1. **Enable AI features** (disabled by default)
2. **Use @mydba chat participant** (requires AI enabled)
3. **Download documentation updates** (Phase 3, optional)

#### What Gets Sent to AI (VSCode Language Model API)

| Data Sent | Example | Purpose | Can Be Disabled? |
|-----------|---------|---------|------------------|
| **Query structure** (templated) | `SELECT * FROM <table:orders> WHERE <col:user_id> = ?` | Query optimization | ✅ Yes (`mydba.ai.anonymizeData`) |
| **Schema context** (table/column metadata) | `orders: {columns: [id, user_id, status], indexes: [PRIMARY, idx_user_id]}` | Better suggestions | ✅ Yes (`mydba.ai.allowSchemaContext`) |
| **Database version** | `MySQL 8.0.35` | Version-specific advice | ❌ Always sent with AI requests |
| **Documentation excerpts** (from local bundle) | `"InnoDB buffer pool caches table data..."` | Grounded responses | ❌ Always sent (local docs only) |

**Average payload size**: 200-600 bytes per AI request
**Network calls**: 1-5 per minute (only when actively using AI)

---

#### What About Profiling Data?

- Performance Schema statement and stage events (for example, `events_statements_history_long`, `events_stages_history_long`) are queried locally and rendered in the UI. MyDBA does not transmit raw profiling rows to any external service.
- If AI is enabled, only the templated SQL plus minimal, non-sensitive metrics (for example, a qualitative summary like "rows examined: high/medium/low") may be summarized and sent. Exact timing values and stage names remain local unless you explicitly paste them into chat.
- Storage: Profiling snapshots are kept in memory by default and are not persisted to disk unless you enable it.

Settings:
```json
{
  "mydba.profiling.persistSnapshots": false,
  "mydba.profiling.includeMetricsInAI": false
}
```

### ❌ Never Transmitted

MyDBA will **NEVER** send:
- ❌ Database passwords or SSH private keys
- ❌ Actual query result data (customer names, emails, addresses, etc.)
- ❌ Full database dumps or table data
- ❌ IP addresses or hostnames of your database servers
- ❌ Connection strings with credentials
- ❌ Data from columns named `password`, `ssn`, `credit_card`, `api_key`, `token`
 - ❌ Performance Schema raw event rows (unless you copy/paste them yourself)

---

## 🛡️ How We Protect Your Data

### 1. Credential Security

**Storage**: VSCode SecretStorage API
- macOS: Keychain
- Windows: Credential Manager
- Linux: Secret Service API (libsecret)

**Transmission**: Never transmitted, even to AI
**Logging**: Never logged (even in debug mode)
**Display**: Masked in UI (`mysql://user:***@host:3306`)

```typescript
// Example: How credentials are handled
const password = await context.secrets.get('mydba.connection.prod');  // Encrypted retrieval
// Password never touches disk, never logged, never sent to AI
```

### 2. AI Data Anonymization

Before sending queries to AI, MyDBA automatically anonymizes them using **query templating**:

```sql
-- Original query (what you write):
SELECT * FROM users WHERE email = 'john@example.com' AND id = 12345

-- Templated query (what gets sent to AI):
SELECT * FROM <table:users> WHERE <col:email> = ? AND <col:id> = ?
```

**Why This Approach?**
- ✅ **Preserves Query Structure**: AI understands table/column relationships
- ✅ **Protects Actual Values**: Your data (`john@example.com`, `12345`) never leaves your machine
- ✅ **Better Suggestions**: AI knows you're filtering on `email` and `id` columns
- ✅ **Schema-Aware**: AI can suggest indexes on `email` or `id` specifically

**Templating Rules**:
- Table names → `<table:tablename>`
- Column names → `<col:columnname>`
- String literals → `?`
- Numeric literals → `?`
- UUIDs → `?`
- Dates → `?`

**Dynamic SQL Note**:
If your application constructs SQL dynamically via string concatenation, MyDBA applies best-effort parsing and templating. Extremely irregular SQL or runtime-built fragments may limit anonymization accuracy. We recommend parameterized queries and testing templating results in sensitive environments.

**Example with JOINs**:
```sql
-- Original:
SELECT u.name, o.total
FROM users u
JOIN orders o ON u.id = o.user_id
WHERE u.email = 'alice@example.com' AND o.status = 'pending'

-- Templated:
SELECT <col:name>, <col:total>
FROM <table:users> <alias:u>
JOIN <table:orders> <alias:o> ON <col:id> = <col:user_id>
WHERE <col:email> = ? AND <col:status> = ?
```

**Can Be Disabled**: If you want to disable templating and send raw queries (not recommended for production):
```json
"mydba.ai.anonymizeData": false
```

### 3. Network Activity Transparency

Every network call is logged in the **Output panel** (`View → Output → MyDBA - Network`):

```
[2025-10-25 14:32:15] POST https://api.vscode.dev/lm
  → Query analysis (128 bytes)
  ← Response (456 bytes, 1.2s)

[2025-10-25 14:35:42] GET https://dev.mysql.com/doc/
  → Documentation check (Phase 3 feature)
  ← Cached (0 bytes)
```

You can **review** all network activity and **disable** any feature that makes calls you're uncomfortable with.

### 4. Version Policy and GA Support

MyDBA supports only GA (Generally Available) versions of MySQL (8.0+/8.4/9.x) and MariaDB (10.6/10.11/11.x). Older versions (for example, MySQL 5.7) are unsupported. This enables modern, secure profiling via Performance Schema as recommended by MySQL.

Reference: https://dev.mysql.com/doc/refman/8.4/en/performance-schema-query-profiling.html

---

## 🎛️ Privacy Controls

### Granular Settings

| Setting | Default | What It Does |
|---------|---------|--------------|
| `mydba.ai.enabled` | `false` | Master AI switch (must opt-in) |
| `mydba.ai.anonymizeData` | `true` | Mask literals before sending to AI |
| `mydba.ai.allowSchemaContext` | `true` | Include table/column names in prompts |
| `mydba.ai.allowQueryHistory` | `false` | Use recent queries as context |
| `mydba.ai.chatEnabled` | `true` | Enable @mydba chat participant |
| `mydba.ai.confirmBeforeSend` | `false` | Prompt before every AI call |
| `mydba.telemetry.enabled` | `false` | Share anonymous usage stats |
| `mydba.security.warnSensitiveColumns` | `true` | Warn about sensitive data in results |
| `mydba.security.redactSensitiveColumns` | `false` | Auto-hide password/ssn/api_key columns |
| `mydba.network.showActivityLog` | `true` | Log network calls in Output panel |

### Visual Indicators

- 🔒 **Lock icon** (status bar): AI disabled
- 🌐 **Globe icon** (status bar): AI request in progress
- 📡 **Network log** (Output panel): All requests logged
- ⚠️ **Sensitive data banner**: Query results may contain PII

### Commands

| Command | What It Does |
|---------|--------------|
| `MyDBA: Clear AI Conversation History` | Wipe all chat context from memory |
| `MyDBA: Export Privacy Report` | See all data sent to AI (last 30 days) |
| `MyDBA: Revoke AI Consent` | Disable AI + clear all history |
| `MyDBA: View Network Activity Log` | Open network activity Output panel |
| `MyDBA: Export User Data` | Export all local MyDBA data (GDPR compliance) |
| `MyDBA: Delete All Local Data` | Wipe all MyDBA cache and settings |

---

## 📜 Compliance & Regulations

### GDPR Compliance (EU)

MyDBA respects your rights under GDPR:

| Right | How MyDBA Supports It |
|-------|----------------------|
| **Right to Access** | `MyDBA: Export User Data` exports all local data |
| **Right to Erasure** | `MyDBA: Delete All Local Data` wipes everything |
| **Right to Portability** | Export connections (without passwords) to JSON |
| **Data Minimization** | Only collect what's necessary for features |
| **Consent Management** | Granular opt-in for AI, telemetry, crash reports |

### Data Residency

- **Local data**: Stored on your machine (respects your location)
- **AI requests**: Routed through VSCode Language Model API (follows VSCode's data processing agreement)
- **No MyDBA servers**: We don't run any servers or collect data centrally

---

## 📞 Telemetry & Analytics

### What We Collect (If You Opt In)

**Default: Disabled** (`mydba.telemetry.enabled: false`)

If you enable telemetry, we collect:
- ✅ Feature usage counts (e.g., "EXPLAIN executed 5 times this week")
- ✅ Database version distribution (e.g., "60% MySQL 8.0, 30% MariaDB 10.11")
- ✅ Performance metrics (extension load time, query latency averages)
- ✅ Error types (crash reports, without query text or user data)

**We NEVER collect**:
- ❌ Query text or SQL code
- ❌ Table/database names
- ❌ Database credentials or connection strings
- ❌ IP addresses or hostnames
- ❌ Personal identifiable information

### How to Review Telemetry

```bash
# Run this command in VSCode:
MyDBA: View Telemetry Data

# Output shows exactly what would be sent:
{
  "features_used": ["explain", "processlist", "ai_chat"],
  "db_versions": ["mysql-8.0.35"],
  "avg_query_time_ms": 45,
  "errors": ["connection_timeout"]
}
```

### Respects VSCode's Telemetry Settings

MyDBA respects VSCode's global telemetry setting:
```json
"telemetry.telemetryLevel": "off"  // MyDBA respects this
```

---

## 🔐 Security Practices

### What We Do

1. ✅ **Follow OWASP Top 10**: Secure coding practices
2. ✅ **Regular Dependency Audits**: Weekly `npm audit` + Snyk scans
3. ✅ **No eval()**: No dynamic code execution
4. ✅ **Content Security Policy**: Strict CSP for webviews
5. ✅ **SQL Injection Prevention**: Parameterized queries only
6. ✅ **TLS Enforcement**: All network calls over HTTPS
7. ✅ **Rate Limiting**: AI API calls rate-limited to prevent abuse

### Security Vulnerability Reporting

If you discover a security issue:

1. **Do NOT** open a public GitHub issue
2. Email: security@mydba.dev (or see `SECURITY.md`)
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Impact assessment
   - Suggested fix (optional)

We aim to respond within **48 hours** and patch critical issues within **7 days**.

---

## 🌐 Third-Party Services

MyDBA integrates with the following external services:

| Service | Purpose | Data Sent | Privacy Policy |
|---------|---------|-----------|----------------|
| **VSCode Language Model API** | AI query optimization, chat | Anonymized queries + schema context | [VSCode LM Privacy](https://code.visualstudio.com/docs/supporting/privacy) |
| **MySQL/MariaDB Docs** (Phase 3) | Live documentation search | Search keywords only | [MySQL](https://www.mysql.com/privacy/) / [MariaDB](https://mariadb.com/privacy-policy/) |

**No other third-party services** are used. MyDBA does not:
- ❌ Send data to our own servers (we don't have any!)
- ❌ Use third-party analytics (Google Analytics, Mixpanel, etc.)
- ❌ Include tracking pixels or beacons
- ❌ Share data with advertisers (no ads, ever)

---

## 📝 Example Privacy Flow

### Scenario: User Asks "@mydba why is my query slow?"

```
1. User types: "@mydba why is my query slow? SELECT * FROM orders WHERE user_id = 12345"

2. MyDBA checks: Is AI enabled?
   - If NO → Show local static rules (no network call)
   - If YES → Continue to step 3

3. MyDBA templates the query (preserves structure, masks values):
   Original:  SELECT * FROM orders WHERE user_id = 12345
   Templated: SELECT * FROM <table:orders> WHERE <col:user_id> = ?

4. MyDBA retrieves local docs (no network):
   - "SELECT * is inefficient" (MySQL 8.0 docs, embedded)
   - "Missing index detection" (performance_schema docs)

5. MyDBA logs network activity:
   [Network] Sending to AI: query (55 chars), schema (1 table, 5 cols), docs (2 excerpts)

6. (Optional) If mydba.ai.confirmBeforeSend = true:
   "Send templated query to AI? [Yes] [No] [Show Data]"

   Clicking "Show Data" displays:
   {
     query: "SELECT * FROM <table:orders> WHERE <col:user_id> = ?",
     schema: { orders: { columns: ["id", "user_id", "status", "total", "created_at"] } }
   }

7. MyDBA sends to VSCode LM API:
   POST https://api.vscode.dev/lm
   Body: { query: "SELECT * FROM <table:orders> WHERE <col:user_id> = ?", ... }
   Size: 312 bytes

8. MyDBA receives response (1.2 seconds later):
   Response: "Issues: SELECT * returns all columns, missing index on user_id..."

9. MyDBA displays in chat with citations:
   🤖 @mydba: Found 2 issues...

   ⚠️  Issues Found:
   • SELECT * returns all 5 columns (only need 3-4?)
   • Missing index on <col:user_id>

   💡 Optimized Query:
   SELECT id, user_id, status, total FROM orders WHERE user_id = ?

   📖 Source: MySQL 8.0 Performance Tuning (embedded docs)

   [Apply to editor] [Show EXPLAIN] [Create index]

10. User sees response + can review network log
```

**Total data sent**: 312 bytes (templated query + schema metadata + docs)
**Sensitive data leaked**: 0 bytes (actual value `12345` never transmitted)
**AI still understands**: The query filters by `user_id` column (can suggest index)

---

## ❓ FAQ

### Q: Can I use MyDBA completely offline?

**Yes!** All core features work without internet:
- Database connections
- Tree view
- Query execution
- PROCESSLIST / variables
- Performance metrics
- Custom views

Only AI features require network access (and can be disabled).

---

### Q: What if I work with HIPAA/PCI-DSS regulated data?

**Recommendations**:
1. Disable AI entirely: `mydba.ai.enabled: false`
2. Enable anonymization: `mydba.ai.anonymizeData: true` (if using AI)
3. Enable confirmation: `mydba.ai.confirmBeforeSend: true`
4. Redact sensitive columns: `mydba.security.redactSensitiveColumns: true`
5. Use on non-production databases only

**Note**: MyDBA is not a data processor under HIPAA/PCI-DSS. If you enable AI, data is processed by VSCode's Language Model API (review their compliance docs).

---

### Q: Does MyDBA send my database password to AI?

**No, never.** Database credentials are:
- Stored encrypted in OS keychain
- Never transmitted over network
- Never logged or displayed
- Never included in AI prompts

---

### Q: Can my employer monitor what queries I run?

**No** (from MyDBA's side). MyDBA:
- Does not log queries to external servers
- Does not send queries to our servers (we don't have any!)
- Only sends anonymized queries to AI (if you enable it)

However, your **database server** may log all queries (check `general_log`, `slow_query_log`).

---

### Q: What data does the @mydba chat participant see?

When you use `@mydba` in VSCode Chat:
- ✅ Your chat messages (e.g., "why is my query slow?")
- ✅ Templated query structure (if you paste SQL)
  - Original: `SELECT * FROM users WHERE email = 'john@example.com'`
  - Templated: `SELECT * FROM <table:users> WHERE <col:email> = ?`
- ✅ Database version and schema metadata (if enabled)
- ✅ Local documentation excerpts
- ❌ **NOT**: Query results, credentials, actual literal values from queries

Chat context is stored **in-memory only** and cleared when VSCode restarts (unless you save conversation history).

**Example of what AI sees**:
```json
{
  "prompt": "Why is my query slow?",
  "query": "SELECT * FROM <table:orders> WHERE <col:user_id> = ?",
  "schema": {
    "orders": {
      "columns": ["id", "user_id", "status", "total"],
      "indexes": ["PRIMARY"],
      "row_estimate": "~145K rows"
    }
  },
  "docs": ["Index selection based on cardinality..."]
}
```

The AI never sees the actual value (`12345`) that you're searching for.

---

### Q: How do I export my privacy report?

```bash
# In VSCode Command Palette (Cmd+Shift+P):
MyDBA: Export Privacy Report

# Output (JSON file):
{
  "report_date": "2025-10-25",
  "ai_requests_last_30_days": 42,
  "data_sent": [
    {
      "timestamp": "2025-10-25T14:32:15Z",
      "type": "query_analysis",
      "payload_size_bytes": 128,
      "anonymized": true,
      "query": "SELECT * FROM *** WHERE *** = ***"
    }
  ],
  "telemetry_sent": [],
  "credentials_transmitted": []  // Always empty
}
```

---

## 📞 Contact

- **Privacy Questions**: privacy@mydba.dev
- **Security Issues**: security@mydba.dev (see `SECURITY.md`)
- **GitHub Issues**: https://github.com/yourusername/mydba/issues
- **Documentation**: https://github.com/yourusername/mydba/docs

---

## 📄 License

MyDBA is open-source under **Apache License 2.0**.
Privacy Policy Version: 1.0 (October 25, 2025)

---

**Last Updated**: October 25, 2025
**Next Review**: April 25, 2026
