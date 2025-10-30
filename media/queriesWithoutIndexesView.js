// @ts-check
(function () {
    // @ts-ignore
    const vscode = acquireVsCodeApi();

    // Global error boundary (defensive UX)
    window.addEventListener('error', (event) => {
        try {
            const container = document.getElementById('error') || document.body;
            const div = document.createElement('div');
            div.style.background = '#8b0000';
            div.style.color = '#fff';
            div.style.padding = '8px 12px';
            div.style.margin = '8px 0';
            div.style.borderRadius = '4px';
            div.textContent = `Error: ${event.error?.message || event.message || 'Unknown error'}`;
            container.prepend(div);
        } catch (_) { /* no-op */ }
    }, { once: true });

    const loading = document.getElementById('loading');
    const error = document.getElementById('error');
    const errorMessage = document.getElementById('error-message');
    const content = document.getElementById('content');
    const queriesList = document.getElementById('queries-list');
    const emptyState = document.getElementById('empty-state');
    const queryCount = document.getElementById('query-count');
    const lastUpdated = document.getElementById('last-updated');
    const refreshBtn = document.getElementById('refresh-btn');
    const autoRefreshBtn = document.getElementById('auto-refresh-btn');

    let autoRefreshEnabled = true;

    // Event listeners
    refreshBtn?.addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
    autoRefreshBtn?.addEventListener('click', () => {
        autoRefreshEnabled = !autoRefreshEnabled;
        vscode.postMessage({ type: 'toggleAutoRefresh' });
        updateAutoRefreshButton();
    });

    // Listen for messages from extension
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
            case 'queriesLoaded':
                handleQueriesLoaded(message.queries, message.timestamp);
                break;
            case 'error':
                showError(message.message);
                break;
            case 'autoRefreshOn':
                autoRefreshEnabled = true;
                updateAutoRefreshButton();
                break;
            case 'autoRefreshOff':
                autoRefreshEnabled = false;
                updateAutoRefreshButton();
                break;
        }
    });

    function handleQueriesLoaded(queries, timestamp) {
        hideLoading();
        hideError();
        content.style.display = 'block';

        if (queryCount) {
            queryCount.textContent = queries.length.toString();
        }

        if (lastUpdated) {
            const date = new Date(timestamp);
            lastUpdated.textContent = `Last updated: ${date.toLocaleString()}`;
        }

        if (queries.length === 0) {
            queriesList.style.display = 'none';
            emptyState.style.display = 'flex';
        } else {
            queriesList.style.display = 'block';
            emptyState.style.display = 'none';
            renderQueries(queries);
        }
    }

    function sanitizeSeverity(severity) {
        const allowed = ['info', 'warning', 'critical'];
        if (allowed.includes(severity)) {
            return severity;
        }
        return 'unknown';
    }

    function renderQueries(queries) {
        let html = '';

        queries.forEach((query, index) => {
            const safeSeverity = sanitizeSeverity(query.severity);
            const severityClass = `severity-${safeSeverity}`;
            const severityIcon = getSeverityIcon(safeSeverity);
            const severityLabel = safeSeverity.toUpperCase();

            html += `
                <div class="query-card ${severityClass}">
                    <div class="query-header">
                        <div class="query-title">
                            <span class="severity-badge ${severityClass}">
                                ${severityIcon} ${severityLabel}
                            </span>
                            <span class="query-schema">${escapeHtml(query.schema)}</span>
                        </div>
                        <div class="query-stats">
                            <span class="stat">
                                <strong>${formatNumber(query.avgRowsExamined)}</strong> avg rows examined
                            </span>
                            <span class="stat">
                                <strong>${query.efficiency.toFixed(2)}%</strong> efficiency
                            </span>
                            <span class="stat">
                                <strong>${formatNumber(query.countStar)}</strong> executions
                            </span>
                        </div>
                    </div>

                    <div class="query-text">
                        <pre>${escapeHtml(query.digestText)}</pre>
                    </div>

                    ${query.suggestedIndexes && query.suggestedIndexes.length > 0 ? `
                        <div class="suggestions">
                            <h4>💡 Index Suggestions</h4>
                            <ul>
                                ${query.suggestedIndexes.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}

                    <div class="query-actions">
                        <vscode-button class="explain-btn" data-query="${escapeHtml(query.digestText)}">
                            <span class="codicon codicon-graph"></span>
                            Explain
                        </vscode-button>
                        <vscode-button class="profile-btn" appearance="secondary" data-query="${escapeHtml(query.digestText)}">
                            <span class="codicon codicon-pulse"></span>
                            Profile
                        </vscode-button>
                        <div class="query-metadata">
                            <span>First seen: ${new Date(query.firstSeen).toLocaleDateString()}</span>
                            <span>Last seen: ${new Date(query.lastSeen).toLocaleString()}</span>
                        </div>
                    </div>
                </div>
            `;
        });

        queriesList.innerHTML = html;

        // Add event listeners to explain/profile buttons
        document.querySelectorAll('.explain-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const queryText = e.currentTarget.getAttribute('data-query');
                vscode.postMessage({ type: 'explainQuery', digestText: queryText });
            });
        });
        document.querySelectorAll('.profile-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const queryText = e.currentTarget.getAttribute('data-query');
                vscode.postMessage({ type: 'profileQuery', digestText: queryText });
            });
        });
    }

    function getSeverityIcon(severity) {
        switch (severity) {
            case 'critical':
                return '🔴';
            case 'warning':
                return '🟡';
            default:
                return '🔵';
        }
    }

    function formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toFixed(0);
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function updateAutoRefreshButton() {
        if (!autoRefreshBtn) return;

        if (autoRefreshEnabled) {
            autoRefreshBtn.innerHTML = '<span class="codicon codicon-debug-pause"></span> Auto-refresh (30s)';
        } else {
            autoRefreshBtn.innerHTML = '<span class="codicon codicon-play"></span> Auto-refresh (Off)';
        }
    }

    function hideLoading() {
        if (loading) loading.style.display = 'none';
    }

    function hideError() {
        if (error) error.style.display = 'none';
    }

    function showError(message) {
        hideLoading();
        if (error && errorMessage) {
            errorMessage.textContent = message;
            error.style.display = 'flex';
        }
    }
})();
