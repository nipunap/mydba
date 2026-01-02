// Storage Engine View Frontend
(function () {
    const vscode = acquireVsCodeApi();

    let currentTab = 'innodb';
    let innoDBStatus = null;
    let ariaStatus = null;
    let snapshots = [];
    let aiAnalysis = null;

    // Initialize
    document.addEventListener('DOMContentLoaded', () => {
        setupEventListeners();
        vscode.postMessage({ command: 'ready' });
    });

    function setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.dataset.tab));
        });

        // Refresh button
        document.getElementById('refreshBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'refresh' });
        });

        // Export button
        document.getElementById('exportBtn').addEventListener('click', () => {
            const data = currentTab === 'innodb' ? innoDBStatus : ariaStatus;
            vscode.postMessage({
                command: 'export',
                data,
                format: 'json'
            });
        });

        // Compare button
        document.getElementById('compareBtn').addEventListener('click', () => {
            if (snapshots.length >= 2) {
                vscode.postMessage({
                    command: 'compareSnapshots',
                    before: snapshots[snapshots.length - 2],
                    after: snapshots[snapshots.length - 1]
                });
            }
        });

        // Auto-refresh toggle
        document.getElementById('autoRefreshToggle').addEventListener('change', (e) => {
            const interval = parseInt(document.getElementById('refreshInterval').value);
            vscode.postMessage({
                command: 'setAutoRefresh',
                enabled: e.target.checked,
                interval
            });
        });

        // Take snapshot button
        const snapshotBtn = document.getElementById('takeSnapshotBtn');
        if (snapshotBtn) {
            snapshotBtn.addEventListener('click', () => {
                takeSnapshot();
            });
        }
    }

    function switchTab(tabName) {
        currentTab = tabName;

        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-tab`);
        });
    }

    function takeSnapshot() {
        if (currentTab === 'innodb' && innoDBStatus) {
            snapshots.push({...innoDBStatus, timestamp: new Date()});
            showMessage(`Snapshot ${snapshots.length} taken`);
        } else if (currentTab === 'aria' && ariaStatus) {
            snapshots.push({...ariaStatus, timestamp: new Date()});
            showMessage(`Snapshot ${snapshots.length} taken`);
        }
    }

    // Handle messages from extension
    window.addEventListener('message', event => {
        const message = event.data;

        switch (message.command) {
            case 'innoDBStatus':
                innoDBStatus = message.status;
                renderInnoDBStatus(message.status, message.alerts);
                break;

            case 'ariaStatus':
                ariaStatus = message.status;
                renderAriaStatus(message.status, message.alerts);
                showAriaTab();
                break;

            case 'aiAnalysis':
                aiAnalysis = message.analysis;
                renderAIAnalysis(message.analysis, message.type);
                break;

            case 'snapshotComparison':
                renderComparison(message.comparison);
                switchTab('comparison');
                break;

            case 'autoRefresh':
                // Trigger refresh from auto-refresh
                vscode.postMessage({ command: 'refresh' });
                break;

            case 'autoRefreshDisabled':
                document.getElementById('autoRefreshToggle').checked = false;
                showMessage(`Auto-refresh disabled: ${message.reason}`, 'warning');
                break;

            case 'error':
                showMessage(`Error: ${message.error}`, 'error');
                break;
        }
    });

    function renderInnoDBStatus(status, alerts) {
        const container = document.getElementById('innodb-status');

        const html = `
            <div class="status-card">
                <h3>🎯 Overall Health</h3>
                <div class="health-score">
                    <div class="health-score-label">Health Score</div>
                    <div class="health-score-value ${getHealthClass(status.healthScore)}">
                        ${status.healthScore}
                    </div>
                    <div class="health-score-label">${getHealthText(status.healthScore)}</div>
                </div>
            </div>

            <div class="status-card">
                <h3>📝 Transactions</h3>
                <div class="metric">
                    <span class="metric-label">History List Length</span>
                    <span class="metric-value">${formatNumber(status.transactions.historyListLength)}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Active Transactions</span>
                    <span class="metric-value">${status.transactions.activeTransactions}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Purge Lag</span>
                    <span class="metric-value">${formatNumber(status.transactions.purgeLag)}</span>
                </div>
            </div>

            <div class="status-card">
                <h3>💾 Buffer Pool</h3>
                <div class="metric">
                    <span class="metric-label">Total Size</span>
                    <span class="metric-value">${formatNumber(status.bufferPool.totalSize)} pages</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Hit Rate</span>
                    <span class="metric-value ${getHitRateClass(status.bufferPool.hitRate)}">
                        ${status.bufferPool.hitRate.toFixed(2)}%
                    </span>
                </div>
                <div class="metric">
                    <span class="metric-label">Dirty Pages</span>
                    <span class="metric-value">${formatNumber(status.bufferPool.dirtyPages)}</span>
                </div>
            </div>

            <div class="status-card">
                <h3>📊 Checkpoint & Log</h3>
                <div class="metric">
                    <span class="metric-label">LSN</span>
                    <span class="metric-value">${formatNumber(status.log.logSequenceNumber)}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Checkpoint Age</span>
                    <span class="metric-value ${getCheckpointClass(status.log.checkpointAgePercent)}">
                        ${status.log.checkpointAgePercent.toFixed(1)}%
                    </span>
                </div>
            </div>

            <div class="status-card">
                <h3>⚡ I/O Operations</h3>
                <div class="metric">
                    <span class="metric-label">Pending Reads</span>
                    <span class="metric-value">${status.io.pendingReads}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Pending Writes</span>
                    <span class="metric-value">${status.io.pendingWrites}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Pending Fsyncs</span>
                    <span class="metric-value">${status.io.pendingFsyncs}</span>
                </div>
            </div>

            <div class="status-card">
                <h3>🔄 Row Operations</h3>
                <div class="metric">
                    <span class="metric-label">Inserts/s</span>
                    <span class="metric-value">${status.rowOps.insertsPerSecond.toFixed(2)}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Updates/s</span>
                    <span class="metric-value">${status.rowOps.updatesPerSecond.toFixed(2)}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Reads/s</span>
                    <span class="metric-value">${status.rowOps.readsPerSecond.toFixed(2)}</span>
                </div>
            </div>
        `;

        container.innerHTML = html;

        // Render alerts
        if (alerts && alerts.length > 0) {
            const alertsHtml = renderAlerts(alerts);
            container.innerHTML += `
                <div class="status-card" style="grid-column: 1 / -1;">
                    <h3>⚠️ Alerts</h3>
                    <div class="alerts">${alertsHtml}</div>
                </div>
            `;
        }
    }

    function renderAriaStatus(status, alerts) {
        const container = document.getElementById('aria-status');

        const html = `
            <div class="status-card">
                <h3>🎯 Overall Health</h3>
                <div class="health-score">
                    <div class="health-score-label">Health Score</div>
                    <div class="health-score-value ${getHealthClass(status.healthScore)}">
                        ${status.healthScore}
                    </div>
                </div>
            </div>

            <div class="status-card">
                <h3>💾 Page Cache</h3>
                <div class="metric">
                    <span class="metric-label">Size</span>
                    <span class="metric-value">${formatNumber(status.pageCache.size)} blocks</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Hit Rate</span>
                    <span class="metric-value">${status.pageCache.hitRate.toFixed(2)}%</span>
                </div>
            </div>

            <div class="status-card">
                <h3>📝 Recovery Log</h3>
                <div class="metric">
                    <span class="metric-label">Size</span>
                    <span class="metric-value">${formatBytes(status.recoveryLog.size)}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Used</span>
                    <span class="metric-value">${formatBytes(status.recoveryLog.used)}</span>
                </div>
            </div>
        `;

        container.innerHTML = html;

        if (alerts && alerts.length > 0) {
            const alertsHtml = renderAlerts(alerts);
            container.innerHTML += `
                <div class="status-card" style="grid-column: 1 / -1;">
                    <h3>⚠️ Alerts</h3>
                    <div class="alerts">${alertsHtml}</div>
                </div>
            `;
        }
    }

    function renderAlerts(alerts) {
        return alerts.map(alert => `
            <div class="alert alert-${escapeHtml(alert.severity)}">
                <div class="alert-title">${escapeHtml(alert.metric)}: ${escapeHtml(alert.message)}</div>
                ${alert.currentValue !== undefined ? `<div class="alert-message">Current: ${escapeHtml(alert.currentValue)}${alert.threshold ? ` (Threshold: ${escapeHtml(alert.threshold)})` : ''}</div>` : ''}
                ${alert.recommendation ? `<div class="alert-recommendation">💡 ${escapeHtml(alert.recommendation)}</div>` : ''}
            </div>
        `).join('');
    }

    function renderAIAnalysis(analysis, type) {
        const container = type === 'innodb'
            ? document.getElementById('innodb-status')
            : document.getElementById('aria-status');

        const aiHtml = `
            <div class="status-card" style="grid-column: 1 / -1;">
                <h3>🤖 AI Analysis</h3>
                <div class="ai-analysis">
                    <h4>Summary</h4>
                    <p>${escapeHtml(analysis.summary)}</p>

                    ${analysis.recommendations && analysis.recommendations.length > 0 ? `
                        <h4>Recommendations</h4>
                        ${analysis.recommendations.map(rec => `
                            <div class="recommendation">• ${escapeHtml(rec)}</div>
                        `).join('')}
                    ` : ''}
                </div>
            </div>
        `;

        container.innerHTML += aiHtml;
    }

    function renderComparison(comparison) {
        const container = document.getElementById('comparison-view');

        const html = `
            <h3>Snapshot Comparison</h3>
            <div class="status-grid">
                ${comparison.deltas.map(delta => `
                    <div class="status-card">
                        <h3>${escapeHtml(delta.metric)}</h3>
                        <div class="metric">
                            <span class="metric-label">Before</span>
                            <span class="metric-value">${formatNumber(delta.before)}</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">After</span>
                            <span class="metric-value">${formatNumber(delta.after)}</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Change</span>
                            <span class="metric-value ${delta.change > 0 ? 'health-warning' : 'health-healthy'}">
                                ${delta.change > 0 ? '+' : ''}${formatNumber(delta.change)}
                                (${delta.changePercent.toFixed(1)}%)
                            </span>
                        </div>
                    </div>
                `).join('')}
            </div>

            ${comparison.significantChanges && comparison.significantChanges.length > 0 ? `
                <div class="status-card">
                    <h3>Significant Changes</h3>
                    <ul>
                        ${comparison.significantChanges.map(change => `<li>${escapeHtml(change)}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
        `;

        container.innerHTML = html;
    }

    function showAriaTab() {
        document.getElementById('ariaTab').style.display = 'block';
    }

    function showMessage(message, type = 'info') {
        // Simple message display (could be enhanced with proper notifications)
        console.log(`[${type}] ${message}`);
    }

    // Helper functions
    
    /**
     * Escape HTML to prevent XSS attacks
     */
    function escapeHtml(unsafe) {
        if (unsafe === undefined || unsafe === null) {
            return '';
        }
        return String(unsafe)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    
    function formatNumber(num) {
        if (num === undefined || num === null) {
            return 'N/A';
        }
        return num.toLocaleString();
    }

    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function getHealthClass(score) {
        if (score >= 80) return 'health-healthy';
        if (score >= 60) return 'health-warning';
        return 'health-critical';
    }

    function getHealthText(score) {
        if (score >= 80) return 'Healthy';
        if (score >= 60) return 'Warning';
        return 'Critical';
    }

    function getHitRateClass(rate) {
        if (rate >= 95) return 'health-healthy';
        if (rate >= 90) return 'health-warning';
        return 'health-critical';
    }

    function getCheckpointClass(percent) {
        if (percent < 70) return 'health-healthy';
        if (percent < 85) return 'health-warning';
        return 'health-critical';
    }
})();
