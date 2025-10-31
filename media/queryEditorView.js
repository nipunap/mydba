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

    let currentResults = null;
    let currentQuery = '';

    // DOM elements
    const queryEditor = document.getElementById('query-editor');
    const executeBtn = document.getElementById('execute-btn');
    const explainBtn = document.getElementById('explain-btn');
    const formatBtn = document.getElementById('format-btn');
    const loading = document.getElementById('loading');
    const error = document.getElementById('error');
    const errorMessage = document.getElementById('error-message');
    const resultsContainer = document.getElementById('results-container');
    const resultsSummary = document.getElementById('results-summary');
    const executionTime = document.getElementById('execution-time');
    const resultsTable = document.getElementById('results-table');
    const resultsThead = document.getElementById('results-thead');
    const resultsTbody = document.getElementById('results-tbody');
    const exportCsvBtn = document.getElementById('export-csv-btn');
    const exportJsonBtn = document.getElementById('export-json-btn');
    const explainContainer = document.getElementById('explain-container');
    const explainContent = document.getElementById('explain-content');

    // Event listeners
    executeBtn?.addEventListener('click', () => executeQuery());
    explainBtn?.addEventListener('click', () => explainQuery());
    formatBtn?.addEventListener('click', () => formatQuery());
    exportCsvBtn?.addEventListener('click', () => exportResults('csv'));
    exportJsonBtn?.addEventListener('click', () => exportResults('json'));

    // Keyboard shortcuts
    queryEditor?.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            executeQuery();
        }
    });

    // Listen for messages from extension
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
            case 'setQuery':
                setQuery(message.query);
                break;
            case 'queryExecuted':
                handleQueryExecuted(message.result, message.query, message.timestamp);
                break;
            case 'queryError':
                handleQueryError(message.error, message.query);
                break;
            case 'queryExecutionCancelled':
                handleQueryCancelled(message.message);
                break;
            case 'explainResult':
                handleExplainResult(message.result, message.query);
                break;
            case 'queryFormatted':
                setQuery(message.query);
                break;
        }
    });

    function setQuery(query) {
        if (queryEditor) {
            queryEditor.value = query;
            currentQuery = query;
        }
    }

    function executeQuery() {
        const query = queryEditor?.value?.trim();
        if (!query) {
            showError('Please enter a query');
            return;
        }

        currentQuery = query;
        showLoading();
        hideError();
        hideResults();
        hideExplain();

        vscode.postMessage({
            type: 'executeQuery',
            query: query
        });
    }

    function explainQuery() {
        const query = queryEditor?.value?.trim();
        if (!query) {
            showError('Please enter a query to explain');
            return;
        }

        // Only EXPLAIN SELECT queries
        if (!query.toUpperCase().startsWith('SELECT')) {
            showError('EXPLAIN only works with SELECT queries');
            return;
        }

        currentQuery = query;
        showLoading();
        hideError();
        hideResults();
        hideExplain();

        vscode.postMessage({
            type: 'explainQuery',
            query: query
        });
    }

    function formatQuery() {
        const query = queryEditor?.value?.trim();
        if (!query) {
            return;
        }

        vscode.postMessage({
            type: 'formatQuery',
            query: query
        });
    }

    function exportResults(format) {
        if (!currentResults) {
            showError('No results to export');
            return;
        }

        vscode.postMessage({
            type: 'exportResults',
            format: format,
            results: currentResults
        });
    }

    function handleQueryExecuted(result, query, timestamp) {
        hideLoading();
        hideError();
        hideExplain();

        currentResults = result;

        if (result.rows && result.rows.length > 0) {
            showResults(result);
        } else {
            // Non-SELECT query (INSERT, UPDATE, DELETE, etc.)
            showNonSelectResults(result);
        }
    }

    function showResults(result) {
        console.log('[QueryEditor] showResults called with:', result);
        console.log('[QueryEditor] resultsContainer:', resultsContainer);

        if (!resultsContainer) {
            console.error('[QueryEditor] resultsContainer element not found!');
            return;
        }

        resultsContainer.style.display = 'flex';
        console.log('[QueryEditor] resultsContainer display set to flex');

        // Summary
        const rowCount = result.rowCount || result.rows.length;
        const timeMs = result.executionTime || 0;
        resultsSummary.textContent = `${rowCount} rows returned`;
        executionTime.textContent = `(${timeMs}ms)`;

        // Table headers
        console.log('[QueryEditor] Creating table headers');
        resultsThead.innerHTML = '';
        const headerRow = document.createElement('tr');
        result.columns.forEach(col => {
            const th = document.createElement('th');
            th.textContent = col.name;
            th.title = col.type || '';
            headerRow.appendChild(th);
        });
        resultsThead.appendChild(headerRow);
        console.log('[QueryEditor] Headers created:', result.columns.length);

        // Table body
        resultsTbody.innerHTML = '';
        result.rows.forEach(row => {
            const tr = document.createElement('tr');
            result.columns.forEach(col => {
                const td = document.createElement('td');
                const value = row[col.name];

                if (value === null || value === undefined) {
                    td.textContent = 'NULL';
                    td.classList.add('null-value');
                } else if (typeof value === 'object') {
                    td.textContent = JSON.stringify(value);
                } else {
                    td.textContent = String(value);
                }

                tr.appendChild(td);
            });
            resultsTbody.appendChild(tr);
        });
    }

    function showNonSelectResults(result) {
        resultsContainer.style.display = 'block';

        const affectedRows = result.affectedRows || 0;
        const timeMs = result.executionTime || 0;

        if (result.insertId) {
            resultsSummary.textContent = `${affectedRows} rows affected (Insert ID: ${result.insertId})`;
        } else {
            resultsSummary.textContent = `${affectedRows} rows affected`;
        }
        executionTime.textContent = `(${timeMs}ms)`;

        // Clear table
        resultsThead.innerHTML = '';
        resultsTbody.innerHTML = '';

        // Show success message in table area
        const messageRow = document.createElement('tr');
        const messageCell = document.createElement('td');
        messageCell.textContent = 'Query executed successfully';
        messageCell.style.textAlign = 'center';
        messageCell.style.padding = '40px';
        messageCell.style.fontStyle = 'italic';
        messageCell.style.color = 'var(--vscode-descriptionForeground)';
        messageRow.appendChild(messageCell);
        resultsTbody.appendChild(messageRow);
    }

    function handleQueryError(errorMsg, query) {
        hideLoading();
        hideResults();
        hideExplain();
        showError(errorMsg);
    }

    function handleQueryCancelled(message) {
        hideLoading();
        hideResults();
        hideExplain();
        showError(message);
    }

    function handleExplainResult(result, query) {
        hideLoading();
        hideError();
        hideResults();

        explainContainer.style.display = 'block';

        // Parse and format the EXPLAIN result
        let explainData = result;

        // If result has EXPLAIN key, extract it
        if (result && result.EXPLAIN) {
            explainData = JSON.parse(result.EXPLAIN);
        }

        // Create a formatted HTML view
        let html = '<div class="explain-summary">';

        if (explainData && explainData.query_block) {
            const queryBlock = explainData.query_block;

            // Summary
            html += '<div class="explain-section">';
            html += '<h4>Query Summary</h4>';
            html += '<table class="explain-table">';

            if (queryBlock.select_id) {
                html += `<tr><td>Select ID</td><td>${queryBlock.select_id}</td></tr>`;
            }
            if (queryBlock.cost_info) {
                html += `<tr><td>Query Cost</td><td>${queryBlock.cost_info.query_cost || 'N/A'}</td></tr>`;
                html += `<tr><td>Rows Examined</td><td>${queryBlock.cost_info.read_cost || 'N/A'}</td></tr>`;
            }

            html += '</table></div>';

            // Table info
            if (queryBlock.table) {
                html += '<div class="explain-section">';
                html += '<h4>Table Access</h4>';
                html += '<table class="explain-table">';

                const table = queryBlock.table;
                html += `<tr><td>Table Name</td><td><strong>${table.table_name || 'N/A'}</strong></td></tr>`;
                html += `<tr><td>Access Type</td><td><span class="access-type ${table.access_type}">${table.access_type || 'N/A'}</span></td></tr>`;

                if (table.possible_keys) {
                    html += `<tr><td>Possible Keys</td><td>${Array.isArray(table.possible_keys) ? table.possible_keys.join(', ') : table.possible_keys}</td></tr>`;
                }
                if (table.key) {
                    html += `<tr><td>Key Used</td><td><strong>${table.key}</strong></td></tr>`;
                }
                if (table.rows_examined_per_scan) {
                    html += `<tr><td>Rows Examined</td><td>${table.rows_examined_per_scan}</td></tr>`;
                }
                if (table.filtered) {
                    html += `<tr><td>Filtered</td><td>${table.filtered}%</td></tr>`;
                }

                html += '</table></div>';

                // Cost info
                if (table.cost_info) {
                    html += '<div class="explain-section">';
                    html += '<h4>Cost Details</h4>';
                    html += '<table class="explain-table">';
                    html += `<tr><td>Read Cost</td><td>${table.cost_info.read_cost || 'N/A'}</td></tr>`;
                    html += `<tr><td>Eval Cost</td><td>${table.cost_info.eval_cost || 'N/A'}</td></tr>`;
                    html += `<tr><td>Prefix Cost</td><td>${table.cost_info.prefix_cost || 'N/A'}</td></tr>`;
                    html += `<tr><td>Data Read Per Join</td><td>${table.cost_info.data_read_per_join || 'N/A'}</td></tr>`;
                    html += '</table></div>';
                }
            }
        }

        html += '</div>';

        // Add collapsible raw JSON
        html += '<details class="raw-json"><summary>View Raw JSON</summary></details>';

        explainContent.innerHTML = html;

        // Safely insert JSON as text inside the <pre> within details
        const detailsEl = explainContent.querySelector('.raw-json');
        if (detailsEl) {
            const preEl = document.createElement('pre');
            preEl.textContent = JSON.stringify(explainData, null, 2);
            detailsEl.appendChild(preEl);
        }

        // Highlight performance issues
        highlightExplainIssues();
    }

    function highlightExplainIssues() {
        // Highlight potential performance issues
        const accessTypes = document.querySelectorAll('.access-type');
        accessTypes.forEach(el => {
            const type = el.textContent.toLowerCase();
            if (type === 'all' || type === 'index') {
                el.style.backgroundColor = '#ffa50080';
                el.style.padding = '2px 6px';
                el.style.borderRadius = '3px';
                el.title = 'Warning: Full table scan or full index scan';
            } else if (type === 'ref' || type === 'eq_ref' || type === 'const') {
                el.style.backgroundColor = '#90ee9080';
                el.style.padding = '2px 6px';
                el.style.borderRadius = '3px';
                el.title = 'Good: Using index efficiently';
            }
        });
    }

    function showLoading() {
        loading.style.display = 'flex';
    }

    function hideLoading() {
        loading.style.display = 'none';
    }

    function showError(message) {
        error.style.display = 'flex';
        errorMessage.textContent = message;
    }

    function hideError() {
        error.style.display = 'none';
    }

    function hideResults() {
        resultsContainer.style.display = 'none';
    }

    function hideExplain() {
        explainContainer.style.display = 'none';
    }
})();
