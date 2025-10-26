# Security Architecture ARD

**Document Type**: Architecture Requirement Document (ARD)
**Version**: 1.0
**Last Updated**: October 25, 2025
**Status**: Approved for Implementation

---

## 1. Overview

Define security architecture for credential management, data anonymization, audit logging, and production safeguards.

---

## 2. Security Layers

### 2.1 Credential Security
- **Storage**: VSCode SecretStorage API (OS keychain)
- **Encryption**: OS-level (Keychain/Credential Manager)
- **Access**: Per-connection isolation
- **Format**: `mydba.connection.${id}.${type}`

### 2.2 Data Privacy
- **Query Anonymization**: Template-based (`<table:name>`, `<col:name>`, `?`)
- **AI Data**: Only templated queries sent, never raw data
- **Local Processing**: Schema metadata, query results stay local
- **Sensitive Detection**: Column name patterns (`email`, `password`, `ssn`)

### 2.3 Network Security
- **SSL/TLS**: Required for all connections
- **SSH Tunneling**: Support for bastion hosts
- **AWS IAM**: Token-based auth for RDS/Aurora
- **Activity Logging**: Transparent network request logging

---

## 3. Production Safeguards

### 3.1 Destructive Operations
```typescript
interface SafetyGuardrails {
  confirmDestructiveOperations: boolean;  // DROP, TRUNCATE, DELETE, UPDATE
  warnMissingWhereClause: boolean;        // UPDATE/DELETE without WHERE
  dryRunMode: boolean;                    // Preview before execute
  environment: 'dev' | 'staging' | 'prod'; // Stricter rules for prod
}
```

### 3.2 Row Limits
- **Previews**: 1,000 rows max (configurable)
- **DML Operations**: Block if > 1,000 rows (override required)
- **Production**: Hard block on large DML (no override)

### 3.3 AI Safety
- **Global Kill Switch**: `mydba.ai.enabled = false`
- **Confirmation**: `mydba.ai.confirmBeforeSend = true`
- **Anonymization**: Always enabled for AI requests
- **Audit Trail**: Log all AI requests/responses

---

## 4. Audit Logging

### 4.1 Events Logged
- Connection attempts (success/failure)
- Destructive operations (DROP, DELETE, UPDATE)
- AI requests (anonymized)
- Configuration changes
- Error conditions

### 4.2 Log Format
```json
{
  "timestamp": "2025-10-25T10:30:00Z",
  "event": "query.execute",
  "connectionId": "mysql-prod",
  "query": "DELETE FROM users WHERE id = ?",
  "rowsAffected": 1,
  "duration": 150,
  "environment": "prod"
}
```

---

## 5. Implementation

### 5.1 Secret Storage
```typescript
class CredentialManager {
  async saveCredentials(id: string, creds: Credentials): Promise<void> {
    await this.secrets.store(`mydba.connection.${id}.password`, creds.password);
    await this.secrets.store(`mydba.connection.${id}.sshKey`, creds.sshKey);
  }
}
```

### 5.2 Safety Checks
```typescript
class SafetyValidator {
  validateQuery(sql: string, env: Environment): ValidationResult {
    const risks = [];

    if (sql.match(/DELETE\s+FROM\s+\w+(?!\s+WHERE)/i)) {
      risks.push({ type: 'MISSING_WHERE', severity: 'CRITICAL' });
    }

    if (env === 'prod' && sql.match(/DROP\s+(TABLE|DATABASE)/i)) {
      risks.push({ type: 'DROP_IN_PROD', severity: 'CRITICAL' });
    }

    return { risks, requiresConfirmation: risks.length > 0 };
  }
}
```

---

## 6. Compliance

- **GDPR**: Right to deletion, data portability
- **SOC 2**: Audit logging, access controls
- **Apache 2.0**: No warranty, limitation of liability

---

**Status**: Approved
**Next Steps**: Implement credential manager, safety validator, audit logger
