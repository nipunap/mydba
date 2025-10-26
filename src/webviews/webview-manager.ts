import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { ConnectionManager } from '../services/connection-manager';
import { ExplainViewerProvider } from './explain-viewer-provider';
import { ProfilingViewerProvider } from './profiling-viewer-provider';
import { ProcessListPanel } from './process-list-panel';
import { VariablesPanel } from './variables-panel';
import { QueryEditorPanel } from './query-editor-panel';
import { ConnectionDialogPanel } from './connection-dialog-panel';
import { MetricsDashboardPanel } from './metrics-dashboard-panel';
import { QueriesWithoutIndexesPanel } from './queries-without-indexes-panel';
import { SlowQueriesPanel } from './slow-queries-panel';
import { QueryProfilingPanel } from './query-profiling-panel';

export class WebviewManager {
    private explainProvider?: ExplainViewerProvider;
    private profilingProvider?: ProfilingViewerProvider;

    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger,
        private connectionManager: ConnectionManager
    ) {}

    initialize(): void {
        this.logger.info('Initializing webview providers...');

        // Register EXPLAIN viewer (keep as sidebar view for future use)
        this.explainProvider = new ExplainViewerProvider(this.context, this.logger);
        // Note: Will be registered when needed

        // Register Profiling viewer (keep as sidebar view for future use)
        this.profilingProvider = new ProfilingViewerProvider(this.context, this.logger);
        // Note: Will be registered when needed

        // Process List and Variables are now opened as editor panels, not sidebar views

        this.logger.info('Webview providers initialized');
    }

    updateExplain(explainResult: any): void {
        if (this.explainProvider) {
            this.explainProvider.updateExplain(explainResult);
        }
    }

    updateProfile(profileResult: any): void {
        if (this.profilingProvider) {
            this.profilingProvider.updateProfile(profileResult);
        }
    }

    showExplainLoading(): void {
        if (this.explainProvider) {
            (this.explainProvider as any).postMessage({ type: 'showLoading' });
        }
    }

    showProfileLoading(): void {
        if (this.profilingProvider) {
            (this.profilingProvider as any).postMessage({ type: 'showLoading' });
        }
    }

    showExplainError(error: string): void {
        if (this.explainProvider) {
            (this.explainProvider as any).postMessage({ type: 'showError', error });
        }
    }

    showProfileError(error: string): void {
        if (this.profilingProvider) {
            (this.profilingProvider as any).postMessage({ type: 'showError', error });
        }
    }

    async showProcessList(connectionId: string): Promise<void> {
        ProcessListPanel.show(
            this.context,
            this.logger,
            this.connectionManager,
            connectionId
        );
    }

    async showVariables(connectionId: string): Promise<void> {
        VariablesPanel.show(
            this.context,
            this.logger,
            this.connectionManager,
            connectionId
        );
    }

    async showQueryEditor(connectionId: string, initialQuery?: string): Promise<void> {
        QueryEditorPanel.show(
            this.context,
            this.logger,
            this.connectionManager,
            connectionId,
            initialQuery
        );
    }

    async showConnectionDialog(editingConnectionId?: string): Promise<void> {
        ConnectionDialogPanel.show(
            this.context,
            this.logger,
            this.connectionManager,
            editingConnectionId
        );
    }

    async showMetricsDashboard(connectionId: string): Promise<void> {
        MetricsDashboardPanel.show(
            this.context,
            this.logger,
            this.connectionManager,
            connectionId
        );
    }

    async showQueriesWithoutIndexes(connectionId: string): Promise<void> {
        QueriesWithoutIndexesPanel.show(
            this.context,
            this.logger,
            this.connectionManager,
            connectionId
        );
    }

    async showSlowQueries(connectionId: string): Promise<void> {
        SlowQueriesPanel.show(
            this.context,
            this.logger,
            this.connectionManager,
            connectionId
        );
    }

    async showQueryProfiling(connectionId: string, query: string): Promise<void> {
        QueryProfilingPanel.show(
            this.context,
            this.logger,
            this.connectionManager,
            connectionId,
            query
        );
    }

    dispose(): void {
        this.logger.info('Disposing webview manager...');
        // Panels will dispose themselves
    }
}
