# MyDBA Query Anonymization Strategy

**Document Version**: 1.0
**Last Updated**: October 25, 2025
**Status**: Approved for Implementation

---

## Overview

MyDBA uses **query templating** to anonymize user queries before sending them to AI for analysis. This approach balances **privacy protection** (masking actual data values) with **AI effectiveness** (preserving query structure for accurate suggestions).

---

## Templating Approach

### Basic Concept

Replace sensitive literal values with placeholders (`?`) while preserving table names, column names, and query structure using semantic tags.

### Templating Format

```
<type:identifier>    - For database objects (tables, columns, aliases)
?                    - For literal values (strings, numbers, dates)
```

---

## Templating Rules

| Original SQL Element | Template Replacement | Example |
|---------------------|---------------------|---------|
| **Table name** | `<table:name>` | `users` → `<table:users>` |
| **Column name** | `<col:name>` | `email` → `<col:email>` |
| **Table alias** | `<alias:name>` | `u` → `<alias:u>` |
| **String literal** | `?` | `'john@example.com'` → `?` |
| **Numeric literal** | `?` | `12345` → `?` |
| **Date literal** | `?` | `'2025-10-25'` → `?` |
| **UUID** | `?` | `'550e8400-e29b...'` → `?` |
| **Boolean** | `?` | `TRUE` → `?` |
| **NULL** | `NULL` | `NULL` (unchanged) |

---

## Examples

### Example 1: Simple SELECT with WHERE

**Original**:
```sql
SELECT * FROM users WHERE email = 'john@example.com' AND id = 12345
```

**Templated**:
```sql
SELECT * FROM <table:users> WHERE <col:email> = ? AND <col:id> = ?
```

**Why This Works**:
- ✅ AI sees you're querying the `users` table
- ✅ AI knows you're filtering by `email` and `id` columns
- ✅ AI can suggest indexes on `email` or `id`
- ❌ AI doesn't see the actual email (`john@example.com`) or ID (`12345`)

---

### Example 2: JOIN with Multiple Tables

**Original**:
```sql
SELECT u.name, u.email, o.total, o.status
FROM users u
JOIN orders o ON u.id = o.user_id
WHERE u.email = 'alice@example.com'
  AND o.status = 'pending'
  AND o.created_at > '2025-01-01'
```

**Templated**:
```sql
SELECT <col:name>, <col:email>, <col:total>, <col:status>
FROM <table:users> <alias:u>
JOIN <table:orders> <alias:o> ON <col:id> = <col:user_id>
WHERE <col:email> = ?
  AND <col:status> = ?
  AND <col:created_at> > ?
```

**Why This Works**:
- ✅ AI understands the JOIN relationship (`users.id = orders.user_id`)
- ✅ AI can suggest composite indexes on `(email, status, created_at)`
- ✅ AI sees table aliases for readability
- ❌ AI doesn't see actual user email, status value, or date

---

### Example 3: Subquery with Aggregates

**Original**:
```sql
SELECT user_id, COUNT(*) as order_count
FROM orders
WHERE status IN ('pending', 'shipped')
  AND total > 100.00
GROUP BY user_id
HAVING COUNT(*) > 5
```

**Templated**:
```sql
SELECT <col:user_id>, COUNT(*) as <alias:order_count>
FROM <table:orders>
WHERE <col:status> IN (?, ?)
  AND <col:total> > ?
GROUP BY <col:user_id>
HAVING COUNT(*) > ?
```

**Why This Works**:
- ✅ AI sees aggregate function usage (COUNT, GROUP BY, HAVING)
- ✅ AI can suggest indexes on `(status, total, user_id)`
- ✅ AI understands the filtering logic
- ❌ AI doesn't see actual status values or monetary threshold

---

### Example 4: Complex Query with Functions

**Original**:
```sql
SELECT
  DATE_FORMAT(created_at, '%Y-%m') as month,
  SUM(total) as revenue
FROM orders
WHERE user_id = 12345
  AND created_at BETWEEN '2025-01-01' AND '2025-12-31'
  AND status != 'cancelled'
GROUP BY DATE_FORMAT(created_at, '%Y-%m')
ORDER BY month DESC
LIMIT 12
```

**Templated**:
```sql
SELECT
  DATE_FORMAT(<col:created_at>, ?) as <alias:month>,
  SUM(<col:total>) as <alias:revenue>
FROM <table:orders>
WHERE <col:user_id> = ?
  AND <col:created_at> BETWEEN ? AND ?
  AND <col:status> != ?
GROUP BY DATE_FORMAT(<col:created_at>, ?)
ORDER BY <alias:month> DESC
LIMIT ?
```

**Why This Works**:
- ✅ AI sees date functions and aggregation patterns
- ✅ AI can suggest indexes on `(user_id, created_at, status)`
- ✅ AI understands date range filtering
- ❌ AI doesn't see actual user ID, dates, or status value

---

### Example 5: UPDATE Statement

**Original**:
```sql
UPDATE users
SET status = 'inactive', last_login = '2025-10-25 10:30:00'
WHERE email = 'john@example.com' AND id = 12345
```

**Templated**:
```sql
UPDATE <table:users>
SET <col:status> = ?, <col:last_login> = ?
WHERE <col:email> = ? AND <col:id> = ?
```

**Why This Works**:
- ✅ AI sees UPDATE pattern with WHERE clause (safe)
- ✅ AI can warn about missing index on `email`
- ✅ AI understands which columns are being modified
- ❌ AI doesn't see actual values being set or matched

---

## Privacy Benefits

### What AI Sees (✅ Safe)

1. **Query Structure**: SELECT, JOIN, WHERE, GROUP BY patterns
2. **Table Names**: Which tables are involved
3. **Column Names**: Which columns are accessed/filtered
4. **Relationships**: JOIN conditions, foreign keys
5. **Functions**: Date functions, aggregates, string operations
6. **Operators**: `=`, `>`, `BETWEEN`, `IN`, etc.

### What AI Never Sees (❌ Protected)

1. **Actual Data Values**: Customer emails, names, IDs
2. **PII**: Personal identifiable information
3. **Business Data**: Order totals, product names
4. **Credentials**: Passwords, API keys, tokens
5. **Sensitive Literals**: SSN, credit cards, phone numbers

---

## AI Benefits (Why Not Just `***`?)

### ❌ Simple Masking (Bad)

```sql
-- Original:
SELECT * FROM users WHERE email = 'john@example.com' AND id = 12345

-- Simple masking:
SELECT * FROM *** WHERE *** = *** AND *** = ***
```

**Problems**:
- AI can't tell what table you're querying
- AI doesn't know which columns are being filtered
- AI can't suggest specific indexes
- AI can't understand JOIN relationships
- Generic suggestions only: "Add an index somewhere"

### ✅ Query Templating (Good)

```sql
-- Templated:
SELECT * FROM <table:users> WHERE <col:email> = ? AND <col:id> = ?
```

**Benefits**:
- AI knows you're querying `users` table
- AI sees filtering on `email` and `id` columns
- AI can suggest: `CREATE INDEX idx_email ON users(email)`
- AI can warn: "Consider composite index on (email, id)"
- AI understands query semantics for accurate advice

---

## Implementation

### Phase 1: SQL Parser

Use an SQL parser library to tokenize queries:

```typescript
import { Parser } from 'node-sql-parser';

function templateQuery(sql: string): string {
  const parser = new Parser();
  const ast = parser.astify(sql);

  return transformAST(ast, {
    onTableName: (name) => `<table:${name}>`,
    onColumnName: (name) => `<col:${name}>`,
    onAlias: (name) => `<alias:${name}>`,
    onLiteral: (value) => '?'
  });
}
```

### Phase 2: Schema Context

Send minimal schema metadata alongside templated query:

```typescript
{
  query: "SELECT * FROM <table:users> WHERE <col:email> = ?",
  schema: {
    "users": {
      "columns": [
        { "name": "id", "type": "INT", "key": "PRIMARY" },
        { "name": "email", "type": "VARCHAR(255)", "key": "UNI" },
        { "name": "name", "type": "VARCHAR(100)", "key": null }
      ],
      "indexes": [
        { "name": "PRIMARY", "columns": ["id"] },
        { "name": "idx_email", "columns": ["email"] }
      ],
      "engine": "InnoDB",
      "row_estimate": "~145000"
    }
  },
  context: "MySQL 8.0.35"
}
```

**Schema Privacy**:
- ✅ Column names and types (needed for index suggestions)
- ✅ Existing indexes (AI can avoid duplicate suggestions)
- ✅ Row estimates (helps AI estimate impact)
- ❌ **NOT** actual row data or sample values

---

## Edge Cases

### Case 1: Queries with Subqueries

**Original**:
```sql
SELECT * FROM users WHERE id IN (
  SELECT user_id FROM orders WHERE total > 100
)
```

**Templated**:
```sql
SELECT * FROM <table:users> WHERE <col:id> IN (
  SELECT <col:user_id> FROM <table:orders> WHERE <col:total> > ?
)
```

### Case 2: Dynamic Table Names (Rare)

**Original**:
```sql
SELECT * FROM `user_2025_10` WHERE id = 12345
```

**Templated**:
```sql
SELECT * FROM <table:user_2025_10> WHERE <col:id> = ?
```

**Note**: Backticks preserved in template for clarity, but table name still exposed. If table name contains sensitive info (e.g., customer name), consider:
- Option A: Hash table name: `<table:hash_abc123>`
- Option B: User setting: `mydba.ai.allowSchemaContext: false` (disables table names)

### Case 3: Column Names Containing PII (Rare)

**Original**:
```sql
SELECT john_doe_email FROM custom_table WHERE id = 1
```

**Templated**:
```sql
SELECT <col:john_doe_email> FROM <table:custom_table> WHERE <col:id> = ?
```

**Note**: If column name itself is sensitive, user can disable schema context entirely.

### Case 4: Optimizer Trace Anonymization (MariaDB, MySQL features)

Optimizer traces may include:
- Table and index names
- Literal values used during planning
- Join order and cost details

Anonymization rules:
- Replace table names with `<table:...>`
- Replace column names with `<col:...>`
- Replace literals with `?`
- Preserve structural keys (e.g., `chosen_index`, `considered_plans`) but mask values

Example (simplified):
```
{
  "join_preparation": {
    "select#": 1,
    "tables": [
      { "table": "<table:orders>", "row_may_be_null": false }
    ]
  },
  "join_optimization": {
    "rows_estimation": {
      "table": "<table:orders>",
      "range_analysis": {
        "possible_keys": ["<col:user_id>"]
      }
    }
  },
  "execution_plan": {
    "chosen_access_method": "range",
    "index": "<col:user_id>",
    "key_length": "?"
  }
}
```

Testing:
- Add unit tests to verify that no raw table names, column names, or literals appear in anonymized trace outputs.

---

## User Controls

### Settings

```typescript
{
  // Enable/disable templating
  "mydba.ai.anonymizeData": true,  // Default: true

  // Include table names in templates
  "mydba.ai.allowSchemaContext": true,  // Default: true

  // Show "before send" confirmation with templated query
  "mydba.ai.confirmBeforeSend": false,  // Default: false
}
```

### Confirmation Dialog (Optional)

When `mydba.ai.confirmBeforeSend` is enabled:

```
┌─────────────────────────────────────────────────────────┐
│ Send templated query to AI for analysis?               │
├─────────────────────────────────────────────────────────┤
│ Original query:                                         │
│ SELECT * FROM users WHERE email = 'john@example.com'   │
│                                                         │
│ Templated query (what AI sees):                        │
│ SELECT * FROM <table:users> WHERE <col:email> = ?      │
│                                                         │
│ Schema context:                                         │
│ users: {columns: [id, email, name], indexes: [PRIMARY]}│
│                                                         │
│ [ Show Full Payload ]  [ Cancel ]  [ Send ]            │
└─────────────────────────────────────────────────────────┘
```

---

## Testing

### Unit Tests

```typescript
describe('Query Templating', () => {
  it('should template simple WHERE clause', () => {
    const input = "SELECT * FROM users WHERE id = 12345";
    const output = templateQuery(input);
    expect(output).toBe("SELECT * FROM <table:users> WHERE <col:id> = ?");
  });

  it('should preserve table and column names', () => {
    const input = "SELECT email FROM users WHERE id = 1";
    const output = templateQuery(input);
    expect(output).toContain("<table:users>");
    expect(output).toContain("<col:email>");
    expect(output).toContain("<col:id>");
  });

  it('should mask all literal types', () => {
    const input = `
      SELECT * FROM orders
      WHERE status = 'pending'
        AND total > 100.50
        AND created_at > '2025-01-01'
    `;
    const output = templateQuery(input);
    expect(output).not.toContain("pending");
    expect(output).not.toContain("100.50");
    expect(output).not.toContain("2025-01-01");
    expect(output).toMatch(/= \?/g);
  });
});
```

### Privacy Audit Tests

```typescript
describe('Privacy Audit', () => {
  it('should never leak PII in templated queries', () => {
    const queries = [
      "SELECT * FROM users WHERE email = 'john@example.com'",
      "SELECT * FROM orders WHERE user_id = 12345",
      "UPDATE users SET password = 'secret123' WHERE id = 1"
    ];

    queries.forEach(query => {
      const templated = templateQuery(query);
      // Check no email, numeric ID, or password value leaks
      expect(templated).not.toMatch(/@/);
      expect(templated).not.toMatch(/\d{3,}/);
      expect(templated).not.toContain("secret");
    });
  });

  it('should anonymize optimizer traces', () => {
    const trace = {
      join_preparation: { tables: [{ table: 'orders' }] },
      execution_plan: { index: 'user_id', key_length: 8 }
    } as any;
    const anonymized = anonymizeOptimizerTrace(trace);
    expect(JSON.stringify(anonymized)).toContain('<table:orders>');
    expect(JSON.stringify(anonymized)).toContain('<col:user_id>');
    expect(JSON.stringify(anonymized)).not.toMatch(/\borders\b(?!>)|\buser_id\b(?!>)/);
  });
});
```

---

## Future Enhancements

### Phase 2: Semantic Type Detection

Detect column semantics from name patterns:

```typescript
const SENSITIVE_PATTERNS = [
  /password/i, /ssn/i, /credit_card/i, /api_key/i, /token/i
];

function isSensitiveColumn(name: string): boolean {
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(name));
}

// Enhanced templating:
// <col:email> → <col:PII:email>
// <col:password> → <col:SENSITIVE:password>
```

AI can then apply stricter rules for sensitive columns.

### Phase 3: Differential Privacy

Add noise to row counts and estimates:

```typescript
{
  schema: {
    "users": {
      "row_estimate": "~145000"  // Actual: 145,723
      // Add ±5% noise for privacy
    }
  }
}
```

---

## Compliance

This templating approach helps with:

- ✅ **GDPR**: Minimizes personal data processing
- ✅ **HIPAA**: PHI not transmitted in queries
- ✅ **PCI-DSS**: Credit card data never in literals
- ✅ **SOC 2**: Demonstrates data protection controls

---

## Approval

**Status**: ✅ Approved for Implementation
**Approved By**: Product Owner
**Date**: October 25, 2025

**Implementation Target**: Phase 1 MVP (Milestone 4, Weeks 13-16)

---

## References

- PRD Section 5.4.2: AI Data Privacy Controls
- PRD Section 5.4.8: Privacy by Design
- `docs/PRIVACY.md`: User-facing privacy policy
- VSCode Language Model API: https://code.visualstudio.com/api/references/vscode-api#lm

---

**Document Version**: 1.0
**Last Updated**: October 25, 2025
