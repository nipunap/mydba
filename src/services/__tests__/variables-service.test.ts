import * as vscode from 'vscode';
import { VariablesService } from '../variables-service';
import { Logger } from '../../utils/logger';
import type { ConnectionManager } from '../connection-manager';
import type { AuditLogger } from '../audit-logger';

describe('VariablesService', () => {
    const context = {
        storageUri: vscode.Uri.file('/tmp'),
        globalStorageUri: vscode.Uri.file('/tmp')
    } as unknown as vscode.ExtensionContext;

    const logger = new Logger('VariablesServiceTest');

    const cm = (opts?: { grants?: string[]; current?: string }) => ({
        getAdapter: () => ({
            query: jest.fn(async (sql: string, _params?: unknown[]) => {
                if (/show grants/i.test(sql)) {
                    return { rows: (opts?.grants || ['GRANT SESSION_VARIABLES_ADMIN ON *.* TO `u`@`%`']).map(g => ({ Grants: g })) as Array<Record<string, unknown>> };
                }
                if (/show global variables like/i.test(sql)) {
                    return { rows: [{ Variable_name: 'max_connections', Value: opts?.current ?? '151' }] as Array<Record<string, unknown>> };
                }
                if (/^set\s+/i.test(sql)) {
                    return { rows: [] as Array<Record<string, unknown>> };
                }
                return { rows: [] as Array<Record<string, unknown>> };
            })
        }),
        getConnection: () => ({ id: 'c1', user: 'u', environment: 'staging' }),
        getConnectionConfig: () => ({ id: 'c1', user: 'u' })
    }) as unknown as ConnectionManager;

    it('validates values against whitelist', () => {
        const svc = new VariablesService(context, logger, {} as unknown as ConnectionManager, {} as unknown as AuditLogger);
        expect(svc.validateValue('max_connections', '200').valid).toBe(true);
        expect(svc.validateValue('max_connections', 'abc').valid).toBe(false);
        expect(svc.validateValue('non_existing_var', 'x').valid).toBe(false);
    });

    it('blocks GLOBAL in prod unless explicitly allowed', async () => {
        const svc = new VariablesService(context, logger, {
            ...cm(),
            getConnection: () => ({ id: 'c1', user: 'u', environment: 'prod' })
        } as unknown as ConnectionManager, {} as unknown as AuditLogger);

        await expect(svc.setVariable('c1', 'GLOBAL', 'max_connections', '200'))
            .rejects.toThrow(/GLOBAL changes are blocked/i);
    });

    it('sets SESSION variable successfully', async () => {
        const svc = new VariablesService(
            context,
            logger,
            cm() as unknown as ConnectionManager,
            { logConfigChange: jest.fn(async () => undefined) } as unknown as AuditLogger
        );
        await expect(svc.setVariable('c1', 'SESSION', 'max_connections', '200')).resolves.toBeUndefined();
    });
});
