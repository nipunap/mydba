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

    let currentProcesses = [];
    let sortColumn = 'time';
    let sortDirection = 'desc';

    // DOM elements
    const loading = document.getElementById('loading');
    const error = document.getElementById('error');
    const errorMessage = document.getElementById('error-message');
    const processList = document.getElementById('process-list');
    const processTbody = document.getElementById('process-tbody');
    const processCount = document.getElementById('process-count');
    const refreshBtn = document.getElementById('refresh-btn');
    const autoRefreshCheckbox = document.getElementById('auto-refresh-checkbox');
    const lastUpdated = document.getElementById('last-updated');

    // Event listeners
    refreshBtn?.addEventListener('click', () => {
        vscode.postMessage({ type: 'refresh' });
    });

    autoRefreshCheckbox?.addEventListener('change', (e) => {
        const checked = e.target.checked;
        vscode.postMessage({
            type: checked ? 'startAutoRefresh' : 'stopAutoRefresh'
        });
    });

    // Handle sorting
    document.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const column = th.getAttribute('data-sort');
            if (sortColumn === column) {
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                sortColumn = column;
                sortDirection = 'desc';
            }
            sortAndRenderProcesses();
        });
    });

    // Listen for messages from extension
    window.addEventListener('message', event => {
        const message = event.data;

        switch (message.type) {
            case 'processListLoaded':
                handleProcessListLoaded(message.processes, message.timestamp);
                break;
            case 'error':
                handleError(message.message);
                break;
            case 'showLoading':
                showLoading();
                break;
        }
    });

    function handleProcessListLoaded(processes, timestamp) {
        currentProcesses = processes;
        hideLoading();
        hideError();
        showProcessList();
        sortAndRenderProcesses();
        updateLastUpdated(timestamp);
    }

    function sortAndRenderProcesses() {
        // Sort processes
        const sorted = [...currentProcesses].sort((a, b) => {
            let aVal = a[sortColumn];
            let bVal = b[sortColumn];

            // Handle null/undefined
            if (aVal == null) {return 1;}
            if (bVal == null) {return -1;}

            // Convert to comparable values
            if (typeof aVal === 'string') {
                aVal = aVal.toLowerCase();
                bVal = bVal.toLowerCase();
            }

            if (aVal < bVal) {return sortDirection === 'asc' ? -1 : 1;}
            if (aVal > bVal) {return sortDirection === 'asc' ? 1 : -1;}
            return 0;
        });

        renderProcesses(sorted);
        updateSortIndicators();
    }

    function renderProcesses(processes) {
        processTbody.innerHTML = '';

        processes.forEach(process => {
            const row = document.createElement('tr');

            // ID
            row.appendChild(createCell(process.id, 'td'));

            // User
            row.appendChild(createCell(process.user, 'td'));

            // Host
            row.appendChild(createCell(process.host, 'td'));

            // Database
            row.appendChild(createCell(process.db || '-', 'td'));

            // Command
            const commandCell = createCell('', 'td');
            commandCell.innerHTML = `<span class="command-badge">${escapeHtml(process.command)}</span>`;
            row.appendChild(commandCell);

            // Time
            const timeCell = createCell(formatTime(process.time), 'td');
            timeCell.classList.add('time-cell');
            if (process.time > 300) {
                timeCell.classList.add('time-long');
            } else if (process.time > 60) {
                timeCell.classList.add('time-medium');
            }
            row.appendChild(timeCell);

            // State
            const stateCell = createCell('', 'td');
            stateCell.innerHTML = `<span class="state-badge state-${getStateClass(process.state)}">${escapeHtml(process.state || '-')}</span>`;
            row.appendChild(stateCell);

            // Info
            const infoCell = createCell(process.info || '-', 'td');
            infoCell.classList.add('info-cell');
            infoCell.title = process.info || '';
            row.appendChild(infoCell);

            // Actions
            const actionsCell = createCell('', 'td');
            actionsCell.classList.add('actions-cell');
            if (process.command !== 'Sleep') {
                const killBtn = document.createElement('vscode-button');
                killBtn.textContent = 'Kill';
                killBtn.className = 'kill-btn';
                killBtn.setAttribute('appearance', 'secondary');
                killBtn.addEventListener('click', () => {
                    vscode.postMessage({
                        type: 'killQuery',
                        processId: process.id
                    });
                });
                actionsCell.appendChild(killBtn);
            }
            row.appendChild(actionsCell);

            processTbody.appendChild(row);
        });

        // Update count
        const activeCount = processes.filter(p => p.command !== 'Sleep').length;
        processCount.textContent = `Total: ${processes.length} processes (${activeCount} active)`;
    }

    function createCell(content, tag = 'td') {
        const cell = document.createElement(tag);
        cell.textContent = content;
        return cell;
    }

    function formatTime(seconds) {
        if (seconds < 60) {
            return `${seconds}s`;
        } else if (seconds < 3600) {
            return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
        } else {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return `${hours}h ${minutes}m`;
        }
    }

    function getStateClass(state) {
        if (!state) {return 'sleeping';}
        const lower = state.toLowerCase();
        if (lower.includes('sleep')) {return 'sleeping';}
        if (lower.includes('query') || lower.includes('executing')) {return 'query';}
        if (lower.includes('wait')) {return 'waiting';}
        if (lower.includes('send')) {return 'sending';}
        return 'query';
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function updateSortIndicators() {
        document.querySelectorAll('th[data-sort]').forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
            if (th.getAttribute('data-sort') === sortColumn) {
                th.classList.add(`sort-${sortDirection}`);
            }
        });
    }

    function updateLastUpdated(timestamp) {
        lastUpdated.textContent = `Last updated: ${timestamp}`;
    }

    function showLoading() {
        loading.style.display = 'flex';
        error.style.display = 'none';
        processList.style.display = 'none';
    }

    function hideLoading() {
        loading.style.display = 'none';
    }

    function showProcessList() {
        processList.style.display = 'block';
    }

    function handleError(message) {
        hideLoading();
        error.style.display = 'flex';
        processList.style.display = 'none';
        errorMessage.textContent = message;
    }

    function hideError() {
        error.style.display = 'none';
    }

    // Initialize
    vscode.postMessage({ type: 'refresh' });
})();
