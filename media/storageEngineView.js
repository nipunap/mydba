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
        updateCompareButtonState(); // Initialize button state
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

        // AI Explain button
        document.getElementById('aiExplainBtn').addEventListener('click', () => {
            const engine = currentTab === 'aria' ? 'aria' : 'innodb';
            vscode.postMessage({ command: 'aiExplain', engine });
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
            } else {
                showMessage(`Need at least 2 snapshots to compare. Current: ${snapshots.length}. Go to Comparison tab and click "Take Snapshot".`, 'warning');
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
        // Snapshot based on available data, not current tab
        // This allows taking snapshots from the Comparison tab after viewing InnoDB/Aria
        if (innoDBStatus) {
            snapshots.push({
                ...innoDBStatus,
                timestamp: new Date(),
                engine: 'innodb'
            });
            showMessage(`InnoDB snapshot ${snapshots.length} taken`, 'info');
            updateCompareButtonState();
        } else if (ariaStatus) {
            snapshots.push({
                ...ariaStatus,
                timestamp: new Date(),
                engine: 'aria'
            });
            showMessage(`Aria snapshot ${snapshots.length} taken`, 'info');
            updateCompareButtonState();
        } else {
            showMessage('No status data available. Please visit the InnoDB or Aria tab first to load data, then return here to take a snapshot.', 'warning');
        }
    }

    function updateCompareButtonState() {
        const compareBtn = document.getElementById('compareBtn');
        const snapshotCount = document.getElementById('snapshotCount');

        if (snapshots.length >= 2) {
            compareBtn.textContent = `📊 Compare (${snapshots.length})`;
            compareBtn.disabled = false;
            compareBtn.style.opacity = '1';
        } else {
            compareBtn.textContent = `📊 Compare (${snapshots.length}/2)`;
            compareBtn.disabled = false; // Keep enabled to show warning message
            compareBtn.style.opacity = '0.6';
        }

        // Update snapshot count in Comparison tab
        if (snapshotCount) {
            snapshotCount.innerHTML = `Snapshots taken: <strong>${escapeHtml(String(snapshots.length))}</strong>`;
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

            case 'aiExplainProgress':
                showMessage(escapeHtml(message.message), 'info');
                break;

            case 'aiExplainResult':
                showAIExplanationModal(message.analysis, message.engine);
                break;

            case 'aiExplainError':
                showMessage(`AI Explanation Error: ${escapeHtml(message.error)}`, 'error');
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
                        ${escapeHtml(String(status.healthScore))}
                    </div>
                    <div class="health-score-label">${escapeHtml(getHealthText(status.healthScore))}</div>
                </div>
            </div>

            <div class="status-card">
                <h3>📝 Transactions</h3>
                <div class="metric">
                    <span class="metric-label">History List Length</span>
                    <span class="metric-value">${escapeHtml(formatNumber(status.transactions.historyListLength))}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Active Transactions</span>
                    <span class="metric-value">${escapeHtml(String(status.transactions.activeTransactions))}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Purge Lag</span>
                    <span class="metric-value">${escapeHtml(formatNumber(status.transactions.purgeLag))}</span>
                </div>
            </div>

            <div class="status-card">
                <h3>💾 Buffer Pool</h3>
                <div class="metric">
                    <span class="metric-label">Total Size</span>
                    <span class="metric-value">${escapeHtml(formatNumber(status.bufferPool.totalSize))} pages</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Hit Rate</span>
                    <span class="metric-value ${getHitRateClass(status.bufferPool.hitRate)}">
                        ${escapeHtml(status.bufferPool.hitRate.toFixed(2))}%
                    </span>
                </div>
                <div class="metric">
                    <span class="metric-label">Dirty Pages</span>
                    <span class="metric-value">${escapeHtml(formatNumber(status.bufferPool.dirtyPages))}</span>
                </div>
            </div>

            <div class="status-card">
                <h3>📊 Checkpoint & Log</h3>
                <div class="metric">
                    <span class="metric-label">LSN</span>
                    <span class="metric-value">${escapeHtml(formatNumber(status.log.logSequenceNumber))}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Checkpoint Age</span>
                    <span class="metric-value ${getCheckpointClass(status.log.checkpointAgePercent)}">
                        ${escapeHtml(status.log.checkpointAgePercent.toFixed(1))}%
                    </span>
                </div>
            </div>

            <div class="status-card">
                <h3>⚡ I/O Operations</h3>
                <div class="metric">
                    <span class="metric-label">Pending Reads</span>
                    <span class="metric-value">${escapeHtml(String(status.io.pendingReads))}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Pending Writes</span>
                    <span class="metric-value">${escapeHtml(String(status.io.pendingWrites))}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Pending Fsyncs</span>
                    <span class="metric-value">${escapeHtml(String(status.io.pendingFsyncs))}</span>
                </div>
            </div>

            <div class="status-card">
                <h3>🔄 Row Operations</h3>
                <div class="metric">
                    <span class="metric-label">Inserts/s</span>
                    <span class="metric-value">${escapeHtml(status.rowOps.insertsPerSecond.toFixed(2))}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Updates/s</span>
                    <span class="metric-value">${escapeHtml(status.rowOps.updatesPerSecond.toFixed(2))}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Reads/s</span>
                    <span class="metric-value">${escapeHtml(status.rowOps.readsPerSecond.toFixed(2))}</span>
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
                        ${escapeHtml(String(status.healthScore))}
                    </div>
                </div>
            </div>

            <div class="status-card">
                <h3>💾 Page Cache</h3>
                <div class="metric">
                    <span class="metric-label">Size</span>
                    <span class="metric-value">${escapeHtml(formatNumber(status.pageCache.size))} blocks</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Hit Rate</span>
                    <span class="metric-value">${escapeHtml(status.pageCache.hitRate.toFixed(2))}%</span>
                </div>
            </div>

            <div class="status-card">
                <h3>📝 Recovery Log</h3>
                <div class="metric">
                    <span class="metric-label">Size</span>
                    <span class="metric-value">${escapeHtml(formatBytes(status.recoveryLog.size))}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Used</span>
                    <span class="metric-value">${escapeHtml(formatBytes(status.recoveryLog.used))}</span>
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
                            <span class="metric-value">${escapeHtml(formatNumber(delta.before))}</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">After</span>
                            <span class="metric-value">${escapeHtml(formatNumber(delta.after))}</span>
                        </div>
                        <div class="metric">
                            <span class="metric-label">Change</span>
                            <span class="metric-value ${delta.change > 0 ? 'health-warning' : 'health-healthy'}">
                                ${delta.change > 0 ? '+' : ''}${escapeHtml(formatNumber(delta.change))}
                                (${escapeHtml(delta.changePercent.toFixed(1))}%)
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

    function showMessage(text, type = 'info') {
        // Simple notification (could be enhanced with a toast/notification component)
        console.log(`[${type}] ${text}`);
    }

    function showAIExplanationModal(analysis, engine) {
        // Create modal overlay
        const modal = document.createElement('div');
        modal.className = 'ai-modal';
        modal.innerHTML = `
            <div class="ai-modal-content">
                <div class="ai-modal-header">
                    <h2>🤖 AI Analysis - ${escapeHtml(engine.toUpperCase())}</h2>
                    <button class="ai-modal-close">✕</button>
                </div>
                <div class="ai-modal-body">
                    <div class="ai-section">
                        <h3>Summary</h3>
                        <p>${escapeHtml(analysis.summary || 'No summary available')}</p>
                    </div>
                    ${analysis.issues && analysis.issues.length > 0 ? `
                        <div class="ai-section ai-concerns">
                            <h3>⚠️ Critical Issues</h3>
                            <ul>
                                ${analysis.issues.map(issue => {
                                    // Handle both object format {severity, description} and string format
                                    if (typeof issue === 'string') {
                                        return `<li>${escapeHtml(issue)}</li>`;
                                    }
                                    const severity = issue.severity || 'warning';
                                    const desc = issue.description || issue;
                                    return `<li><strong>[${escapeHtml(severity)}]</strong> ${escapeHtml(desc)}</li>`;
                                }).join('')}
                            </ul>
                        </div>
                    ` : ''}
                    ${analysis.recommendations && analysis.recommendations.length > 0 ? `
                        <div class="ai-section">
                            <h3>💡 Recommendations</h3>
                            <ul>
                                ${analysis.recommendations.map(rec => `<li>${escapeHtml(rec)}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                    ${analysis.configChanges && analysis.configChanges.length > 0 ? `
                        <div class="ai-section">
                            <h3>⚙️ Configuration Changes</h3>
                            <ul>
                                ${analysis.configChanges.map(config => {
                                    // Handle both object format {parameter, current, recommended, reason} and string format
                                    if (typeof config === 'string') {
                                        return `<li>${escapeHtml(config)}</li>`;
                                    }
                                    return `<li>
                                        <strong>${escapeHtml(config.parameter)}:</strong>
                                        ${escapeHtml(config.current)} → ${escapeHtml(config.recommended)}
                                        <br><em style="opacity: 0.8; font-size: 0.95em;">${escapeHtml(config.reason)}</em>
                                    </li>`;
                                }).join('')}
                            </ul>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Add event listener for close button
        const closeBtn = modal.querySelector('.ai-modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.remove();
            });
        }

        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }
})();
