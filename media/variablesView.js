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

    let allVariables = [];
    let currentScope = 'global';
    let sortColumn = 'name';
    let sortDirection = 'asc';

    // DOM elements
    const loading = document.getElementById('loading');
    const error = document.getElementById('error');
    const errorMessage = document.getElementById('error-message');
    const variablesList = document.getElementById('variables-list');
    const variablesTbody = document.getElementById('variables-tbody');
    const variableCount = document.getElementById('variable-count');
    const refreshBtn = document.getElementById('refresh-btn');
    const searchInput = document.getElementById('search-input');
    const tabGlobal = document.getElementById('tab-global');
    const tabSession = document.getElementById('tab-session');

    // Event listeners
    refreshBtn?.addEventListener('click', () => {
        vscode.postMessage({ type: 'refresh' });
    });

    searchInput?.addEventListener('input', (e) => {
        filterVariables(e.target.value);
    });

    tabGlobal?.addEventListener('click', () => {
        if (currentScope !== 'global') {
            currentScope = 'global';
            vscode.postMessage({ type: 'changeScope', scope: 'global' });
        }
    });

    tabSession?.addEventListener('click', () => {
        if (currentScope !== 'session') {
            currentScope = 'session';
            vscode.postMessage({ type: 'changeScope', scope: 'session' });
        }
    });

    // Handle sorting
    document.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const column = th.getAttribute('data-sort');
            if (sortColumn === column) {
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                sortColumn = column;
                sortDirection = 'asc';
            }
            sortAndRenderVariables();
        });
    });

    // Listen for messages from extension
    window.addEventListener('message', event => {
        const message = event.data;

        switch (message.type) {
            case 'variablesLoaded':
                handleVariablesLoaded(message.variables, message.scope);
                break;
            case 'error':
                handleError(message.message);
                break;
        }
    });

    function handleVariablesLoaded(variables, scope) {
        allVariables = variables;
        currentScope = scope;
        hideLoading();
        hideError();
        showVariablesList();
        sortAndRenderVariables();

        // Clear search when changing scope
        if (searchInput) {
            searchInput.value = '';
        }
    }

    function sortAndRenderVariables() {
        const sorted = [...allVariables].sort((a, b) => {
            let aVal = a[sortColumn];
            let bVal = b[sortColumn];

            if (aVal == null) {return 1;}
            if (bVal == null) {return -1;}

            if (typeof aVal === 'string') {
                aVal = aVal.toLowerCase();
                bVal = bVal.toLowerCase();
            }

            if (aVal < bVal) {return sortDirection === 'asc' ? -1 : 1;}
            if (aVal > bVal) {return sortDirection === 'asc' ? 1 : -1;}
            return 0;
        });

        renderVariables(sorted);
        updateSortIndicators();
    }

    function renderVariables(variables) {
        variablesTbody.innerHTML = '';

        variables.forEach(variable => {
            const row = document.createElement('tr');
            row.setAttribute('data-name', variable.name.toLowerCase());
            row.setAttribute('data-value', variable.value.toLowerCase());

            // Name
            const nameCell = createCell(variable.name, 'td');
            nameCell.classList.add('name-cell');
            row.appendChild(nameCell);

            // Value
            const valueCell = createCell(variable.value, 'td');
            valueCell.classList.add('value-cell');
            row.appendChild(valueCell);

            variablesTbody.appendChild(row);
        });

        updateCount();
    }

    function filterVariables(searchText) {
        const search = searchText.toLowerCase().trim();
        const rows = variablesTbody.querySelectorAll('tr');

        let visibleCount = 0;
        rows.forEach(row => {
            const name = row.getAttribute('data-name') || '';
            const value = row.getAttribute('data-value') || '';

            if (!search || name.includes(search) || value.includes(search)) {
                row.classList.remove('filtered');
                visibleCount++;
            } else {
                row.classList.add('filtered');
            }
        });

        updateCount(visibleCount, rows.length);
    }

    function createCell(content, tag = 'td') {
        const cell = document.createElement(tag);
        cell.textContent = content;
        return cell;
    }

    function updateSortIndicators() {
        document.querySelectorAll('th[data-sort]').forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
            if (th.getAttribute('data-sort') === sortColumn) {
                th.classList.add(`sort-${sortDirection}`);
            }
        });
    }

    function updateCount(visible, total) {
        if (visible !== undefined && total !== undefined) {
            variableCount.textContent = `Showing ${visible} of ${total} variables`;
        } else {
            variableCount.textContent = `Total: ${allVariables.length} variables`;
        }
    }

    function showLoading() {
        loading.style.display = 'flex';
        error.style.display = 'none';
        variablesList.style.display = 'none';
    }

    function hideLoading() {
        loading.style.display = 'none';
    }

    function showVariablesList() {
        variablesList.style.display = 'block';
    }

    function handleError(message) {
        hideLoading();
        error.style.display = 'flex';
        variablesList.style.display = 'none';
        errorMessage.textContent = message;
    }

    function hideError() {
        error.style.display = 'none';
    }

    // Initialize
    vscode.postMessage({ type: 'refresh' });
})();
