// @ts-check
(function () {
    // @ts-ignore
    const vscode = acquireVsCodeApi();

    const loading = document.getElementById('loading');
    const errorBox = document.getElementById('error');
    const errorMessage = document.getElementById('error-message');
    const content = document.getElementById('content');
    const rowsList = document.getElementById('rows-list');
    const emptyState = document.getElementById('empty-state');
    const rowCount = document.getElementById('row-count');
    const lastUpdated = document.getElementById('last-updated');
    const refreshBtn = document.getElementById('refresh-btn');
    const autoRefreshBtn = document.getElementById('auto-refresh-btn');

    // Error boundary
    window.addEventListener('error', (event) => {
        showError(event.error?.message || event.message || 'Unknown error');
    }, { once: true });

    let autoRefreshEnabled = true;
    refreshBtn?.addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
    autoRefreshBtn?.addEventListener('click', () => {
        autoRefreshEnabled = !autoRefreshEnabled;
        vscode.postMessage({ type: 'toggleAutoRefresh' });
        updateAutoRefreshButton();
    });

    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
            case 'slowQueriesLoaded':
                handleLoaded(message.rows, message.timestamp);
                break;
            case 'error':
                showError(message.message);
                break;
            case 'autoRefreshOn':
                autoRefreshEnabled = true; updateAutoRefreshButton();
                break;
            case 'autoRefreshOff':
                autoRefreshEnabled = false; updateAutoRefreshButton();
                break;
        }
    });

    function handleLoaded(rows, timestamp) {
        hideLoading();
        hideError();
        content.style.display = 'block';

        if (rowCount) rowCount.textContent = rows.length.toString();
        if (lastUpdated) lastUpdated.textContent = `Last updated: ${new Date(timestamp).toLocaleString()}`;

        if (!rows || rows.length === 0) {
            rowsList.style.display = 'none';
            emptyState.style.display = 'flex';
            return;
        }

        emptyState.style.display = 'none';
        rowsList.style.display = 'block';
        renderRows(rows);
    }

    function renderRows(rows) {
        let html = '';
        rows.forEach((r) => {
            html += `
            <div class="query-card">
                <div class="query-header">
                    <div class="query-title">
                        <span class="schema">${escapeHtml(r.schema || '-')}</span>
                        <span class="meta">avg: ${r.avgMs.toFixed(2)} ms · total: ${r.totalMs.toFixed(2)} ms · count: ${r.count}</span>
                    </div>
                </div>
                <div class="query-text"><pre>${escapeHtml(r.digestText)}</pre></div>
                <div class="query-stats">
                    <span>rows examined: ${formatNumber(r.rowsExamined)}</span>
                    <span>rows sent: ${formatNumber(r.rowsSent)}</span>
                    ${r.firstSeen ? `<span>first: ${new Date(r.firstSeen).toLocaleString()}</span>` : ''}
                    ${r.lastSeen ? `<span>last: ${new Date(r.lastSeen).toLocaleString()}</span>` : ''}
                </div>
                <div class="query-actions">
                    <vscode-button class="explain-btn" data-query="${escapeHtml(r.digestText)}"><span class="codicon codicon-graph"></span> Explain</vscode-button>
                    <vscode-button class="profile-btn" appearance="secondary" data-query="${escapeHtml(r.digestText)}"><span class="codicon codicon-pulse"></span> Profile</vscode-button>
                </div>
            </div>`;
        });
        rowsList.innerHTML = html;

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

    function updateAutoRefreshButton() {
        if (!autoRefreshBtn) return;
        autoRefreshBtn.innerHTML = autoRefreshEnabled
            ? '<span class="codicon codicon-debug-pause"></span> Auto-refresh (30s)'
            : '<span class="codicon codicon-play"></span> Auto-refresh (Off)';
    }

    function showError(message) {
        if (loading) loading.style.display = 'none';
        if (errorBox && errorMessage) {
            errorMessage.textContent = message;
            errorBox.style.display = 'flex';
        }
    }
    function hideError() { if (errorBox) errorBox.style.display = 'none'; }
    function hideLoading() { if (loading) loading.style.display = 'none'; }

    function formatNumber(num) {
        const n = Number(num) || 0;
        if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
        if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
        return n.toFixed(0);
    }
    function escapeHtml(text) {
        const div = document.createElement('div'); div.textContent = text; return div.innerHTML;
    }
})();
