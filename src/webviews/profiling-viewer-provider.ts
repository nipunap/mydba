import * as vscode from 'vscode';
import { BaseWebviewProvider } from './base-webview-provider';
import { Logger } from '../utils/logger';
import { ProfileResult } from '../adapters/database-adapter';

export interface ProfilingStage {
    name: string;
    duration: number;
    percentage: number;
    color: string;
}

export class ProfilingViewerProvider extends BaseWebviewProvider {
    private currentProfile?: ProfileResult;

    constructor(context: vscode.ExtensionContext, logger: Logger) {
        super(context, logger);
    }

    updateProfile(profileResult: ProfileResult): void {
        this.currentProfile = profileResult;
        this.postMessage({
            type: 'updateProfile',
            data: this.convertToProfilingStages(profileResult)
        });
    }

    protected getHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: https:;">
    <title>Query Profiling Viewer</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 16px;
            overflow-x: auto;
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .title {
            font-size: 18px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }

        .controls {
            display: flex;
            gap: 8px;
        }

        .btn {
            padding: 6px 12px;
            border: 1px solid var(--vscode-button-border);
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
        }

        .btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 12px;
            margin-bottom: 20px;
        }

        .metric {
            padding: 12px;
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            text-align: center;
        }

        .metric-value {
            font-size: 20px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }

        .metric-label {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }

        .timeline {
            margin-bottom: 20px;
        }

        .timeline-title {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 12px;
            color: var(--vscode-foreground);
        }

        .waterfall {
            display: flex;
            align-items: center;
            height: 40px;
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            overflow: hidden;
        }

        .stage {
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 11px;
            font-weight: 500;
            cursor: pointer;
            transition: opacity 0.2s;
            position: relative;
        }

        .stage:hover {
            opacity: 0.8;
        }

        .stage-tooltip {
            position: absolute;
            bottom: 100%;
            left: 50%;
            transform: translateX(-50%);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-foreground);
            padding: 6px 8px;
            border-radius: 3px;
            font-size: 11px;
            white-space: nowrap;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.2s;
            z-index: 1000;
        }

        .stage:hover .stage-tooltip {
            opacity: 1;
        }

        .stages-list {
            margin-top: 16px;
        }

        .stage-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            margin: 4px 0;
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
        }

        .stage-item:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .stage-name {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            color: var(--vscode-foreground);
        }

        .stage-duration {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        .stage-percentage {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-left: 8px;
        }

        .empty-state {
            text-align: center;
            padding: 40px 20px;
            color: var(--vscode-descriptionForeground);
        }

        .empty-state-icon {
            font-size: 48px;
            margin-bottom: 16px;
            opacity: 0.5;
        }

        .loading {
            text-align: center;
            padding: 20px;
            color: var(--vscode-descriptionForeground);
        }

        .spinner {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 2px solid var(--vscode-panel-border);
            border-radius: 50%;
            border-top-color: var(--vscode-foreground);
            animation: spin 1s ease-in-out infinite;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .insights {
            margin-top: 20px;
            padding: 12px;
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 3px solid var(--vscode-textBlockQuote-border);
            border-radius: 3px;
        }

        .insights-title {
            font-weight: 600;
            color: var(--vscode-foreground);
            margin-bottom: 8px;
        }

        .insight-item {
            margin: 4px 0;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="title">Query Profiling Timeline</div>
        <div class="controls">
            <button class="btn" id="refreshBtn" onclick="refreshProfile()">Refresh</button>
            <button class="btn" id="exportBtn" onclick="exportProfile()" disabled>Export</button>
        </div>
    </div>

    <div id="content">
        <div class="empty-state">
            <div class="empty-state-icon">⏱️</div>
            <div>No profiling data available</div>
            <div style="font-size: 12px; margin-top: 8px;">
                Select a query and run "MyDBA: Profile Query" to see execution timeline
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function renderProfile(profileData) {
            const content = document.getElementById('content');
            if (!profileData || !profileData.stages || profileData.stages.length === 0) {
                content.innerHTML = \`
                    <div class="empty-state">
                        <div class="empty-state-icon">⏱️</div>
                        <div>No profiling data available</div>
                        <div style="font-size: 12px; margin-top: 8px;">
                            Select a query and run "MyDBA: Profile Query" to see execution timeline
                        </div>
                    </div>
                \`;
                return;
            }

            const totalDuration = profileData.stages.reduce((sum, stage) => sum + stage.duration, 0);
            const maxDuration = Math.max(...profileData.stages.map(s => s.duration));

            content.innerHTML = \`
                <div class="summary">
                    <div class="metric">
                        <div class="metric-value">\${totalDuration.toFixed(2)}ms</div>
                        <div class="metric-label">Total Duration</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value">\${profileData.stages.length}</div>
                        <div class="metric-label">Execution Stages</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value">\${profileData.stages[0]?.name || 'N/A'}</div>
                        <div class="metric-label">Slowest Stage</div>
                    </div>
                </div>

                <div class="timeline">
                    <div class="timeline-title">Execution Timeline</div>
                    <div class="waterfall">
                        \${profileData.stages.map(stage => \`
                            <div class="stage" style="width: \${(stage.duration / maxDuration) * 100}%; background-color: \${stage.color};"
                                 title="\${stage.name}: \${stage.duration.toFixed(2)}ms (\${stage.percentage.toFixed(1)}%)">
                                <div class="stage-tooltip">
                                    \${stage.name}: \${stage.duration.toFixed(2)}ms (\${stage.percentage.toFixed(1)}%)
                                </div>
                            </div>
                        \`).join('')}
                    </div>
                </div>

                <div class="stages-list">
                    <div class="timeline-title">Stage Details</div>
                    \${profileData.stages.map(stage => \`
                        <div class="stage-item">
                            <div class="stage-name">\${stage.name}</div>
                            <div style="display: flex; align-items: center;">
                                <div class="stage-duration">\${stage.duration.toFixed(2)}ms</div>
                                <div class="stage-percentage">(\${stage.percentage.toFixed(1)}%)</div>
                            </div>
                        </div>
                    \`).join('')}
                </div>

                <div class="insights">
                    <div class="insights-title">💡 Performance Insights</div>
                    \${generateInsights(profileData.stages)}
                </div>
            \`;

            document.getElementById('exportBtn').disabled = false;
        }

        function generateInsights(stages) {
            const insights = [];
            const totalDuration = stages.reduce((sum, stage) => sum + stage.duration, 0);

            // Find slowest stage
            const slowestStage = stages.reduce((max, stage) => stage.duration > max.duration ? stage : max);
            if (slowestStage.duration > totalDuration * 0.5) {
                insights.push(\`<div class="insight-item">• <strong>\${slowestStage.name}</strong> takes \${(slowestStage.duration / totalDuration * 100).toFixed(1)}% of total time - consider optimization</div>\`);
            }

            // Check for I/O intensive stages
            const ioStages = stages.filter(s => s.name.toLowerCase().includes('read') || s.name.toLowerCase().includes('write'));
            if (ioStages.length > 0) {
                const ioDuration = ioStages.reduce((sum, stage) => sum + stage.duration, 0);
                insights.push(\`<div class="insight-item">• I/O operations (\${ioStages.map(s => s.name).join(', ')}) take \${(ioDuration / totalDuration * 100).toFixed(1)}% of time</div>\`);
            }

            // Check for sorting stages
            const sortStages = stages.filter(s => s.name.toLowerCase().includes('sort'));
            if (sortStages.length > 0) {
                insights.push(\`<div class="insight-item">• Sorting detected - consider adding indexes to eliminate sorting</div>\`);
            }

            if (insights.length === 0) {
                insights.push('<div class="insight-item">• Query appears to be well-optimized</div>');
            }

            return insights.join('');
        }

        function refreshProfile() {
            vscode.postMessage({ type: 'refreshProfile' });
        }

        function exportProfile() {
            vscode.postMessage({ type: 'exportProfile' });
        }

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'updateProfile':
                    renderProfile(message.data);
                    break;
                case 'showLoading':
                    document.getElementById('content').innerHTML = \`
                        <div class="loading">
                            <div class="spinner"></div>
                            <div>Profiling query...</div>
                        </div>
                    \`;
                    break;
                case 'showError':
                    document.getElementById('content').innerHTML = \`
                        <div class="empty-state">
                            <div class="empty-state-icon">❌</div>
                            <div>Error loading profiling data</div>
                            <div style="font-size: 12px; margin-top: 8px;">\${message.error}</div>
                        </div>
                    \`;
                    break;
            }
        });

        // Initialize
        renderProfile(null);
    </script>
</body>
</html>`;
    }

    protected setupMessageHandlers(): void {
        if (!this._view) {
            return;
        }

        this._disposables.push(
            this._view.webview.onDidReceiveMessage(message => {
                switch (message.type) {
                    case 'refreshProfile':
                        this.handleRefreshProfile();
                        break;
                    case 'exportProfile':
                        this.handleExportProfile();
                        break;
                }
            })
        );
    }

    private convertToProfilingStages(profileResult: ProfileResult): { stages: ProfilingStage[], totalDuration: number } {
        const totalDuration = profileResult.totalDuration;
        const stages: ProfilingStage[] = profileResult.stages.map((stage, index) => ({
            name: stage.Stage,
            duration: stage.Duration,
            percentage: (stage.Duration / totalDuration) * 100,
            color: this.getStageColor(stage.Stage, stage.Duration, totalDuration)
        }));

        return { stages, totalDuration };
    }

    private getStageColor(stageName: string, duration: number, totalDuration: number): string {
        const percentage = (duration / totalDuration) * 100;

        // Color based on stage type and duration
        if (stageName.toLowerCase().includes('read') || stageName.toLowerCase().includes('write')) {
            return percentage > 30 ? '#F44336' : '#FF9800'; // Red for high I/O, Orange for moderate
        }
        if (stageName.toLowerCase().includes('sort')) {
            return '#9C27B0'; // Purple for sorting
        }
        if (stageName.toLowerCase().includes('index')) {
            return '#4CAF50'; // Green for index operations
        }
        if (stageName.toLowerCase().includes('join')) {
            return '#2196F3'; // Blue for joins
        }

        // Default colors based on duration percentage
        if (percentage > 50) return '#F44336'; // Red
        if (percentage > 25) return '#FF9800'; // Orange
        if (percentage > 10) return '#FFC107'; // Yellow
        return '#4CAF50'; // Green
    }

    private handleRefreshProfile(): void {
        this.logger.debug('Profiling refresh requested');
        // TODO: Trigger profiling refresh from active connection
    }

    private handleExportProfile(): void {
        this.logger.debug('Profiling export requested');
        // TODO: Export profiling data as JSON or image
    }
}
