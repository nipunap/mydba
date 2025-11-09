import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { ConnectionManager } from './connection-manager';
import { AuditLogger } from './audit-logger';
import { ValidationError } from '../types';
import variableMetadata from '../data/variable-metadata.json';

type VariableScope = 'GLOBAL' | 'SESSION';

interface VariableMetadata {
    category: string;
    type: 'boolean' | 'integer' | 'size' | 'enum' | 'string';
    risk: 'safe' | 'caution' | 'dangerous';
    description: string;
    recommendation: string;
    min?: number;
    max?: number;
    options?: string[];
}

interface SetOptions {
    persist?: boolean;
    reason?: string;
    allowGlobalInProd?: boolean;
}

interface UndoEntry {
    name: string;
    scope: VariableScope;
    oldValue: string;
    timestamp: number;
}

/**
 * VariablesService
 *
 * Safe variable read/validate/set with whitelist enforcement, audit logging and undo stack.
 */
export class VariablesService {
    private metadata: Record<string, VariableMetadata>;
    private undoStacks = new Map<string, UndoEntry[]>(); // connectionId -> stack

    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger,
        private connectionManager: ConnectionManager,
        private auditLogger: AuditLogger
    ) {
        // Load curated metadata (whitelist)
        this.metadata = variableMetadata as Record<string, VariableMetadata>;
    }

    getMetadata(name: string): VariableMetadata | undefined {
        return this.metadata[name];
    }

    /**
     * Validate a proposed value against metadata rules.
     */
    validateValue(name: string, value: string): { valid: boolean; message?: string } {
        const info = this.metadata[name];
        if (!info) {
            return { valid: false, message: 'Variable is not whitelisted for editing' };
        }
        const trimmed = value.trim();
        const upper = trimmed.toUpperCase();

        // Keywords allowed for all types
        if (upper === 'NULL' || upper === 'DEFAULT') {
            return { valid: true };
        }

        switch (info.type) {
            case 'boolean': {
                if (!['ON', 'OFF', '0', '1', 'TRUE', 'FALSE'].includes(upper)) {
                    return { valid: false, message: 'Must be ON, OFF, 0, 1, TRUE, or FALSE' };
                }
                return { valid: true };
            }
            case 'integer': {
                if (!/^-?\d+$/.test(trimmed)) {
                    return { valid: false, message: 'Must be an integer' };
                }
                const num = parseInt(trimmed, 10);
                if (info.min !== undefined && num < info.min) {
                    return { valid: false, message: `Must be ≥ ${info.min}` };
                }
                if (info.max !== undefined && num > info.max) {
                    return { valid: false, message: `Must be ≤ ${info.max}` };
                }
                return { valid: true };
            }
            case 'size': {
                if (!/^\d+[KMG]?$/i.test(trimmed)) {
                    return { valid: false, message: 'Must be a number with optional K/M/G suffix' };
                }
                if (trimmed.startsWith('-')) {
                    return { valid: false, message: 'Size cannot be negative' };
                }
                return { valid: true };
            }
            case 'enum': {
                if (!info.options || !info.options.includes(upper)) {
                    return { valid: false, message: `Must be one of: ${info.options?.join(', ')}` };
                }
                return { valid: true };
            }
            case 'string':
            default:
                return { valid: true };
        }
    }

    /**
     * Check privileges by parsing SHOW GRANTS output.
     */
    async getVariablePrivileges(connectionId: string): Promise<{ hasSession: boolean; hasGlobal: boolean }> {
        const adapter = this.connectionManager.getAdapter(connectionId);
        if (!adapter) {
            throw new Error('Connection not found or not connected');
        }
        try {
            const result = await adapter.query<{ Grants: string }>('SHOW GRANTS');
            const lines = (result.rows || []) as unknown as Array<Record<string, string>>;
            const grants = Object.values(Object.assign({}, ...lines)).join('\n');
            const hasSession = /SESSION_VARIABLES_ADMIN/i.test(grants) || /ALL PRIVILEGES/i.test(grants);
            const hasGlobal = /SYSTEM_VARIABLES_ADMIN/i.test(grants) || /SUPER/i.test(grants) || /ALL PRIVILEGES/i.test(grants);
            return { hasSession, hasGlobal };
        } catch {
            // Fail-open on detection but actual set will surface 1227 errors if missing
            this.logger.warn('SHOW GRANTS failed when checking variable privileges, proceeding with best-effort detection');
            return { hasSession: false, hasGlobal: false };
        }
    }

    /**
     * Read the current value of a variable from the database.
     */
    async readCurrentValue(connectionId: string, scope: VariableScope, name: string): Promise<string | undefined> {
        const adapter = this.connectionManager.getAdapter(connectionId);
        if (!adapter) {
            throw new Error('Connection not found or not connected');
        }
        const sql = scope === 'GLOBAL'
            ? 'SHOW GLOBAL VARIABLES LIKE ?'
            : 'SHOW SESSION VARIABLES LIKE ?';
        const res = await adapter.query<{ Variable_name: string; Value: string }>(sql, [name]);
        const row = (res.rows || [])[0] as unknown as { Variable_name: string; Value: string } | undefined;
        return row?.Value;
        }

    /**
     * Set a variable safely with validation, audit and undo.
     */
    async setVariable(
        connectionId: string,
        scope: VariableScope,
        name: string,
        newValue: string,
        options?: SetOptions
    ): Promise<void> {
        // Whitelist + name validation
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
            throw new ValidationError('Invalid variable name', 'name');
        }
        const meta = this.metadata[name];
        if (!meta) {
            throw new ValidationError('Variable is not whitelisted for editing', 'name');
        }
        // Value validation
        const valResult = this.validateValue(name, newValue);
        if (!valResult.valid) {
            throw new ValidationError(valResult.message || 'Invalid value', 'value');
        }

        const connection = this.connectionManager.getConnection(connectionId);
        if (!connection) {
            throw new Error('Connection not found');
        }
        const isProd = connection.environment === 'prod';
        if (isProd && scope === 'GLOBAL' && !options?.allowGlobalInProd) {
            throw new ValidationError('GLOBAL changes are blocked in production by default. Provide explicit override and reason.', 'scope');
        }
        if (isProd && scope === 'GLOBAL' && !options?.reason) {
            throw new ValidationError('A reason is required for GLOBAL changes in production.', 'reason');
        }

        // Privilege hints
        const privs = await this.getVariablePrivileges(connectionId);
        if (scope === 'GLOBAL' && !privs.hasGlobal) {
            this.logger.warn('User likely lacks SYSTEM_VARIABLES_ADMIN; attempting change will surface DB error if insufficient.');
        }
        if (scope === 'SESSION' && !privs.hasSession) {
            this.logger.warn('User likely lacks SESSION_VARIABLES_ADMIN; attempting change will surface DB error if insufficient.');
        }

        const adapter = this.connectionManager.getAdapter(connectionId);
        if (!adapter) {
            throw new Error('Adapter not found');
        }

        // Read old value for audit + undo
        const oldValue = await this.readCurrentValue(connectionId, scope, name);

        // Persist vs non-persist (only for GLOBAL)
        const usePersist = !!options?.persist && scope === 'GLOBAL';

        // Delegate to adapter setter for safety
        // We pass the raw string and let the adapter parameterize where possible
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyAdapter = adapter as any;
        if (typeof anyAdapter.setSystemVariable !== 'function') {
            // Fallback to raw query if setter not available (still safe via validation)
            const scopeKeyword = usePersist ? 'PERSIST' : scope;
            const keywordValue = this.asKeywordToken(meta.type, newValue);
            if (keywordValue !== undefined) {
                await adapter.query(`SET ${scopeKeyword} ${name} = ${keywordValue}`);
            } else {
                await adapter.query(`SET ${scopeKeyword} ${name} = ?`, [newValue]);
            }
        } else {
            await anyAdapter.setSystemVariable(scope, name, newValue, { persist: usePersist, type: meta.type });
        }

        // Record undo
        if (oldValue !== undefined) {
            const stack = this.undoStacks.get(connectionId) || [];
            stack.push({ name, scope, oldValue, timestamp: Date.now() });
            // Keep last 20
            if (stack.length > 20) {
                stack.shift();
            }
            this.undoStacks.set(connectionId, stack);
        }

        // Audit
        const config = this.connectionManager.getConnectionConfig(connectionId);
        await this.auditLogger.logConfigChange(
            `${scope}.${name}`,
            oldValue ?? null,
            newValue,
            config?.user ?? 'unknown'
        );
    }

    /**
     * Undo last variable change for a connection (best-effort).
     */
    async undoLastChange(connectionId: string): Promise<UndoEntry | undefined> {
        const stack = this.undoStacks.get(connectionId);
        if (!stack || stack.length === 0) {
            return undefined;
        }
        const entry = stack.pop();
        if (!entry) {
            return undefined;
        }
        const adapter = this.connectionManager.getAdapter(connectionId);
        if (!adapter) {
            throw new Error('Adapter not found');
        }
        const scopeKeyword = entry.scope;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyAdapter = adapter as any;
        if (typeof anyAdapter.setSystemVariable === 'function') {
            await anyAdapter.setSystemVariable(entry.scope, entry.name, entry.oldValue, { persist: false, type: this.metadata[entry.name]?.type || 'string' });
        } else {
            const metaType = this.metadata[entry.name]?.type || 'string';
            const token = this.asKeywordToken(metaType, entry.oldValue);
            if (token !== undefined) {
                await adapter.query(`SET ${scopeKeyword} ${entry.name} = ${token}`);
            } else {
                await adapter.query(`SET ${scopeKeyword} ${entry.name} = ?`, [entry.oldValue]);
            }
        }
        return entry;
    }

    private asKeywordToken(type: VariableMetadata['type'], value: string): string | undefined {
        const trimmed = value.trim();
        const upper = trimmed.toUpperCase();
        if (upper === 'DEFAULT' || upper === 'NULL') {
            return upper;
        }
        if (type === 'boolean' || type === 'enum') {
            if (['ON', 'OFF', 'TRUE', 'FALSE'].includes(upper)) {
                return upper;
            }
            if (/^-?\d+$/.test(trimmed)) {
                return String(parseInt(trimmed, 10));
            }
        }
        if (type === 'integer' && /^-?\d+$/.test(trimmed)) {
            return String(parseInt(trimmed, 10));
        }
        if (type === 'size' && /^\d+[KMG]?$/i.test(trimmed)) {
            return trimmed;
        }
        return undefined;
    }
}
