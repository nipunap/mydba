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
    let groupBy = 'none';
    let filterText = '';
    let expandedGroups = new Set();
    let filterTimeout = null; // For debouncing

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

    // Grouping dropdown
    const groupBySelect = document.getElementById('group-by');
    groupBySelect?.addEventListener('change', (e) => {
        groupBy = e.target.value;
        try {
            localStorage.setItem('mydba.processlist.groupBy', groupBy);
        } catch (err) {
            console.warn('Failed to save groupBy preference:', err);
        }
        sortAndRenderProcesses();
    });

    // Filter input with debouncing (300ms)
    const filterInput = document.getElementById('filter-input');
    filterInput?.addEventListener('input', (e) => {
        const value = e.target.value.toLowerCase();

        if (filterTimeout) {
            clearTimeout(filterTimeout);
        }

        filterTimeout = setTimeout(() => {
            filterText = value;
            sortAndRenderProcesses();
        }, 300);
    });

    // Keyboard navigation for group headers (event delegation)
    processTbody?.addEventListener('keydown', (e) => {
        if (e.target.closest('.group-header') && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            e.target.closest('.group-header').click();
        }
    });

    // Load saved grouping preference
    try {
        const savedGroupBy = localStorage.getItem('mydba.processlist.groupBy');
        if (savedGroupBy && groupBySelect) {
            groupBySelect.value = savedGroupBy;
            groupBy = savedGroupBy;
        }
    } catch (err) {
        console.warn('Failed to load groupBy preference:', err);
    }

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

    function groupProcesses(processes) {
        if (groupBy === 'none') {
            return [{ key: 'all', label: null, processes }];
        }

        const groups = {};
        processes.forEach(process => {
            let key;
            switch (groupBy) {
                case 'user':
                    key = process.user || '(unknown)';
                    break;
                case 'host':
                    key = process.host || '(unknown)';
                    break;
                case 'query':
                    key = process.queryFingerprint || '(no query)';
                    break;
                default:
                    key = 'all';
            }

            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(process);
        });

        return Object.entries(groups)
            .map(([key, procs]) => ({
                key,
                label: key,
                processes: procs
            }))
            .sort((a, b) => b.processes.length - a.processes.length); // Sort by count
    }

    function renderProcesses(processes) {
        const startTime = performance.now();
        processTbody.innerHTML = '';

        // Apply filter
        const filtered = processes.filter(p => {
            if (!filterText) return true;
            const searchText = filterText.toLowerCase();
            return (
                (p.user && p.user.toLowerCase().includes(searchText)) ||
                (p.host && p.host.toLowerCase().includes(searchText)) ||
                (p.db && p.db.toLowerCase().includes(searchText)) ||
                (p.info && p.info.toLowerCase().includes(searchText)) ||
                (p.command && p.command.toLowerCase().includes(searchText))
            );
        });

        // Group processes
        const groups = groupProcesses(filtered);

        // Use document fragment for better performance
        const fragment = document.createDocumentFragment();

        groups.forEach(group => {
            // Render group header if grouped
            if (group.label) {
                const groupRow = createGroupHeader(group);
                fragment.appendChild(groupRow);
            }

            // Render processes in group
            const isExpanded = group.label === null || expandedGroups.has(group.key);
            if (isExpanded) {
                group.processes.forEach(process => {
                    const row = createProcessRow(process);
                    if (group.label) {
                        row.classList.add('grouped-row');
                    }
                    fragment.appendChild(row);
                });
            }
        });

        processTbody.appendChild(fragment);
        updateProcessCount(filtered.length);

        const renderTime = performance.now() - startTime;
        console.debug(`Rendered ${filtered.length} processes in ${renderTime.toFixed(2)}ms`);
    }

    function createGroupHeader(group) {
        const row = document.createElement('tr');
        row.classList.add('group-header');
        row.setAttribute('role', 'button');
        row.setAttribute('tabindex', '0');
        row.setAttribute('aria-expanded', expandedGroups.has(group.key) ? 'true' : 'false');
        row.dataset.groupKey = group.key;

        const isExpanded = expandedGroups.has(group.key);
        const totalTime = group.processes.reduce((sum, p) => sum + (p.time || 0), 0);
        const avgTime = group.processes.length > 0
            ? Math.round(totalTime / group.processes.length)
            : 0;
        const inTransaction = group.processes.filter(p => p.inTransaction).length;

        const cell = document.createElement('td');
        cell.colSpan = 10; // FIX: 10 columns (ID, User, Host, DB, Command, Time, State, Transaction, Info, Actions)
        cell.innerHTML = `
            <div class="group-header-content">
                <span class="group-expand-icon" aria-hidden="true">${isExpanded ? '▼' : '▶'}</span>
                <strong>${escapeHtml(group.label)}</strong>
                <span class="group-stats">
                    ${group.processes.length} process${group.processes.length !== 1 ? 'es' : ''}
                    | Avg time: ${formatTime(avgTime)}
                    ${inTransaction > 0 ? `| <span class="transaction-badge" role="status">🔄 ${inTransaction} in transaction</span>` : ''}
                </span>
            </div>
        `;

        row.addEventListener('click', () => toggleGroup(group.key, row));

        return row;
    }

    function toggleGroup(groupKey, row) {
        if (expandedGroups.has(groupKey)) {
            expandedGroups.delete(groupKey);
            row.setAttribute('aria-expanded', 'false');
        } else {
            expandedGroups.add(groupKey);
            row.setAttribute('aria-expanded', 'true');
        }
        sortAndRenderProcesses();
    }

    function createProcessRow(process) {
        const row = document.createElement('tr');

        // ID
        row.appendChild(createCell(process.id, 'td'));

        // User
        row.appendChild(createCell(process.user || '-', 'td'));

        // Host
        row.appendChild(createCell(process.host || '-', 'td'));

        // Database
        row.appendChild(createCell(process.db || '-', 'td'));

        // Command
        const commandCell = createCell('', 'td');
        commandCell.innerHTML = `<span class="command-badge">${escapeHtml(process.command || '-')}</span>`;
        row.appendChild(commandCell);

        // Time
        const timeCell = createCell(formatTime(process.time || 0), 'td');
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

        // Transaction (NEW) with proper date handling
        const transactionCell = createCell('', 'td');
        if (process.inTransaction) {
            let duration = 0;
            if (process.transactionStarted) {
                try {
                    const startDate = new Date(process.transactionStarted);
                    if (!isNaN(startDate.getTime())) {
                        duration = Math.floor((Date.now() - startDate.getTime()) / 1000);
                    }
                } catch (err) {
                    console.warn('Failed to parse transaction start date:', err);
                }
            }
            const isLong = duration > 60;
            const badgeClass = isLong ? 'transaction-long' : 'transaction-active';
            const icon = isLong ? '⚠️' : '🔄';
            const ariaLabel = isLong
                ? `Long running transaction: ${formatTime(duration)}`
                : `Active transaction: ${formatTime(duration)}`;
            const badge = `<span class="transaction-badge ${badgeClass}"
                title="Transaction ID: ${escapeHtml(process.transactionId || 'N/A')}"
                aria-label="${ariaLabel}">${icon} ${formatTime(duration)}</span>`;
            transactionCell.innerHTML = badge;
        } else if (process.autocommit === true) {
            transactionCell.innerHTML = '<span class="transaction-badge transaction-autocommit" title="Autocommit enabled" aria-label="Autocommit enabled">✅</span>';
        } else {
            transactionCell.innerHTML = '-';
        }
        row.appendChild(transactionCell);

        // Info (query)
        const infoCell = createCell('', 'td');
        infoCell.classList.add('info-cell');
        const queryText = process.info || '';
        const truncated = queryText.length > 100 ? queryText.substring(0, 100) + '...' : queryText;
        infoCell.textContent = truncated;
        infoCell.title = queryText;
        row.appendChild(infoCell);

        // Actions
        const actionsCell = createCell('', 'td');
        actionsCell.classList.add('actions-cell');
        if (process.command !== 'Sleep') {
            const killBtn = document.createElement('vscode-button');
            killBtn.textContent = 'Kill';
            killBtn.className = 'kill-btn';
            killBtn.setAttribute('appearance', 'secondary');
            killBtn.setAttribute('aria-label', `Kill process ${process.id}`);
            killBtn.addEventListener('click', () => {
                vscode.postMessage({
                    type: 'killQuery',
                    processId: process.id
                });
            });
            actionsCell.appendChild(killBtn);
        }
        row.appendChild(actionsCell);

        return row;
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

    function updateProcessCount(count) {
        const activeCount = currentProcesses.filter(p => p.command !== 'Sleep').length;
        processCount.textContent = `Total: ${count} processes (${activeCount} active)`;
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
