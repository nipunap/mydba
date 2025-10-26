// @ts-check
(function () {
    // @ts-ignore
    const vscode = acquireVsCodeApi();

    // DOM elements
    const loading = document.getElementById('loading');
    const error = document.getElementById('error');
    const errorMessage = document.getElementById('error-message');
    const content = document.getElementById('content');
    const queryText = document.getElementById('query-text');
    const treeDiagram = document.getElementById('tree-diagram');
    const treeView = document.getElementById('tree-view');
    const tableView = document.getElementById('table-view');
    const tableContent = document.getElementById('table-content');
    const rawJson = document.getElementById('raw-json');
    const toggleViewBtn = document.getElementById('toggle-view');
    const expandAllBtn = document.getElementById('expand-all');
    const collapseAllBtn = document.getElementById('collapse-all');
    const exportDropdown = document.getElementById('export-dropdown');
    const searchInput = document.getElementById('search-input');

    let currentData = null;
    let currentView = 'tree'; // 'tree' or 'table'
    let currentRawJson = null;
    let searchTimeout = null;

    // Event listeners - with proper null checks
    toggleViewBtn?.addEventListener('click', toggleView);
    expandAllBtn?.addEventListener('click', expandAll);
    collapseAllBtn?.addEventListener('click', collapseAll);

    // Only add listeners if elements exist
    if (exportDropdown) {
        exportDropdown.addEventListener('change', handleExport);
    }
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            // Performance: Debounce search to avoid multiple re-renders
            if (searchTimeout) {
                clearTimeout(searchTimeout);
            }
            searchTimeout = setTimeout(() => handleSearch(e), 300);
        });
    }

    // Listen for messages from extension
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
            case 'explainData':
                handleExplainData(message.data, message.query, message.rawJson);
                break;
            case 'error':
                showError(message.message);
                break;
        }
    });

    function handleExplainData(data, query, rawJsonData) {
        currentData = data;
        currentRawJson = rawJsonData;

        hideLoading();
        hideError();
        content.style.display = 'block';

        // Display query
        if (queryText) {
            queryText.textContent = query;
        }

        // Display raw JSON
        if (rawJson) {
            rawJson.textContent = JSON.stringify(rawJsonData, null, 2);
        }

        // Render visualizations
        renderTreeDiagram(data);
        renderTableView(data);
    }

    function renderTreeDiagram(data) {
        if (!treeDiagram || !d3) return;

        // Clear existing content
        treeDiagram.innerHTML = '';

        const width = treeDiagram.clientWidth || 800;
        const height = 600;

        // Create SVG
        const svg = d3.select(treeDiagram)
            .append('svg')
            .attr('width', width)
            .attr('height', height)
            .style('background', 'var(--vscode-editor-background)');

        const g = svg.append('g')
            .attr('transform', 'translate(40,40)');

        // Create tree layout
        const treeLayout = d3.tree()
            .size([height - 80, width - 200]);

        // Convert data to hierarchy
        const root = d3.hierarchy(data, d => d.children);

        // Generate tree
        const treeData = treeLayout(root);

        // Create links
        g.selectAll('.link')
            .data(treeData.links())
            .enter()
            .append('path')
            .attr('class', 'link')
            .attr('fill', 'none')
            .attr('stroke', 'rgba(255, 255, 255, 0.2)')
            .attr('stroke-width', 2)
            .attr('d', d3.linkHorizontal()
                .x(d => d.y)
                .y(d => d.x));

        // Create nodes
        const nodes = g.selectAll('.node')
            .data(treeData.descendants())
            .enter()
            .append('g')
            .attr('class', 'node')
            .attr('transform', d => `translate(${d.y},${d.x})`);

        // Add circles for nodes
        nodes.append('circle')
            .attr('r', 8)
            .attr('fill', d => getNodeColor(d.data.severity))
            .attr('stroke', '#fff')
            .attr('stroke-width', 2)
            .style('cursor', 'pointer')
            .style('transition', 'all 0.2s ease')
            .on('click', (event, d) => {
                event.stopPropagation();
                showNodeDetails(d.data);
            })
            .on('mouseenter', function(event, d) {
                d3.select(this)
                    .attr('r', 12)
                    .attr('stroke-width', 3);
            })
            .on('mouseleave', function(event, d) {
                d3.select(this)
                    .attr('r', 8)
                    .attr('stroke-width', 2);
            });

        // Add labels
        nodes.append('text')
            .attr('dy', -15)
            .attr('x', 0)
            .style('text-anchor', 'middle')
            .style('fill', '#cccccc')
            .style('font-size', '12px')
            .style('font-weight', 'bold')
            .text(d => {
                if (d.data.table) {
                    return `${d.data.table} (${d.data.accessType})`;
                }
                return d.data.type;
            });

        // Add row count
        nodes.filter(d => d.data.rows)
            .append('text')
            .attr('dy', 25)
            .attr('x', 0)
            .style('text-anchor', 'middle')
            .style('fill', '#999')
            .style('font-size', '10px')
            .text(d => `${d.data.rows.toLocaleString()} rows`);

        // Add zoom behavior
        const zoom = d3.zoom()
            .scaleExtent([0.5, 3])
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
            });

        svg.call(zoom);
    }

    function getNodeColor(severity) {
        switch (severity) {
            case 'critical':
                return 'rgb(255, 99, 132)'; // Red
            case 'warning':
                return 'rgb(255, 206, 86)'; // Yellow
            case 'good':
                return 'rgb(75, 255, 192)'; // Green
            default:
                return 'rgb(201, 153, 255)'; // Purple
        }
    }

    function showNodeDetails(nodeData) {
        // Remove any existing popup
        const existing = document.querySelector('.node-detail-popup');
        if (existing) existing.remove();

        const details = [];

        // Header with severity badge
        const severityBadge = getSeverityBadge(nodeData.severity);
        details.push(`<div class="detail-header">`);
        details.push(`<h3>${nodeData.type}${nodeData.table ? ': ' + nodeData.table : ''}</h3>`);
        details.push(severityBadge);
        details.push(`</div>`);

        // Details grid
        details.push(`<div class="detail-grid">`);

        if (nodeData.accessType) {
            details.push(`<div class="detail-item"><span class="detail-label">Access Type:</span> <span class="access-type-badge ${nodeData.accessType}">${nodeData.accessType}</span></div>`);
        }

        if (nodeData.key) {
            details.push(`<div class="detail-item"><span class="detail-label">Index Used:</span> <strong>${nodeData.key}</strong></div>`);
        }

        if (nodeData.possibleKeys && nodeData.possibleKeys.length > 0) {
            details.push(`<div class="detail-item"><span class="detail-label">Possible Keys:</span> ${nodeData.possibleKeys.join(', ')}</div>`);
        }

        if (nodeData.rows) {
            details.push(`<div class="detail-item"><span class="detail-label">Rows Examined:</span> <strong>${nodeData.rows.toLocaleString()}</strong></div>`);
        }

        if (nodeData.filtered !== undefined) {
            const filteredClass = nodeData.filtered < 10 ? 'warning' : 'good';
            details.push(`<div class="detail-item"><span class="detail-label">Filtered:</span> <span class="${filteredClass}">${nodeData.filtered}%</span></div>`);
        }

        if (nodeData.cost !== undefined && nodeData.cost !== null && typeof nodeData.cost === 'number' && !isNaN(nodeData.cost)) {
            const costClass = nodeData.cost > 10000 ? 'critical' : (nodeData.cost > 1000 ? 'warning' : 'good');
            details.push(`<div class="detail-item"><span class="detail-label">Estimated Cost:</span> <span class="${costClass}"><strong>${nodeData.cost.toFixed(2)}</strong></span></div>`);
        }

        details.push(`</div>`);

        // Issues section
        if (nodeData.issues && nodeData.issues.length > 0) {
            details.push('<div class="detail-issues">');
            details.push('<h4>💡 Optimization Hints</h4>');
            details.push('<ul>');
            nodeData.issues.forEach(issue => {
                details.push(`<li>${issue}</li>`);
            });
            details.push('</ul>');
            details.push('</div>');
        }

        // Create popup
        const detailsHtml = details.join('');
        const popup = document.createElement('div');
        popup.className = 'node-detail-popup';
        popup.innerHTML = detailsHtml;

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.className = 'detail-close-btn';
        closeBtn.innerHTML = '×';
        closeBtn.onclick = () => popup.remove();

        popup.appendChild(closeBtn);
        document.body.appendChild(popup);

        // Animate in
        setTimeout(() => popup.classList.add('visible'), 10);

        // Close on click outside
        setTimeout(() => {
            const closeOnOutside = (e) => {
                if (!popup.contains(e.target)) {
                    popup.classList.remove('visible');
                    setTimeout(() => popup.remove(), 200);
                    document.removeEventListener('click', closeOnOutside);
                }
            };
            document.addEventListener('click', closeOnOutside);
        }, 100);
    }

    function getSeverityBadge(severity) {
        const badges = {
            'critical': '<span class="severity-badge severity-critical">🔴 CRITICAL</span>',
            'warning': '<span class="severity-badge severity-warning">🟡 WARNING</span>',
            'good': '<span class="severity-badge severity-good">🟢 GOOD</span>'
        };
        return badges[severity] || '<span class="severity-badge">ℹ️ INFO</span>';
    }

    function renderTableView(data) {
        if (!tableContent) return;

        let html = '<div class="table-view-content">';

        // Query Summary Section
        html += '<div class="explain-section">';
        html += '<h4>Query Summary</h4>';
        html += '<table class="explain-detail-table">';
        html += '<tr><th>Property</th><th>Value</th></tr>';
        html += `<tr><td>Query Type</td><td>${escapeHtml(data.type)}</td></tr>`;
        if (data.cost !== undefined && data.cost !== null && typeof data.cost === 'number' && !isNaN(data.cost)) {
            html += `<tr><td>Estimated Cost</td><td class="${getCostClass(data.cost)}">${data.cost.toFixed(2)}</td></tr>`;
        }
        if (data.issues && data.issues.length > 0) {
            const issuesHtml = data.issues.map(i => escapeHtml(i)).join('<br>');
            html += `<tr><td>Issues</td><td class="issues-cell">${issuesHtml}</td></tr>`;
        }
        html += '</table>';
        html += '</div>';

        // Execution Plan Table
        html += '<div class="explain-section">';
        html += '<h4>Execution Plan Details</h4>';
        const rows = [];
        collectTableRows(data, rows, 0);

        html += '<table class="explain-table">';
        html += '<thead><tr>';
        html += '<th>Level</th>';
        html += '<th>Type</th>';
        html += '<th>Table</th>';
        html += '<th>Access Type</th>';
        html += '<th>Possible Keys</th>';
        html += '<th>Key Used</th>';
        html += '<th>Rows</th>';
        html += '<th>Filtered</th>';
        html += '<th>Cost</th>';
        html += '</tr></thead>';
        html += '<tbody>';

        rows.forEach(row => {
            const severityClass = row.severity || '';
            const indent = '→ '.repeat(row.level);
            html += `<tr class="severity-${severityClass}">`;
            html += `<td>${row.level}</td>`;
            html += `<td>${indent}${escapeHtml(row.type)}</td>`;
            html += `<td>${row.table ? escapeHtml(row.table) : '-'}</td>`;
            html += `<td>${row.accessType ? `<span class="access-type ${row.accessType}">${escapeHtml(row.accessType)}</span>` : '-'}</td>`;
            html += `<td>${row.possibleKeys ? formatArray(row.possibleKeys) : '-'}</td>`;
            html += `<td>${row.key ? `<strong>${escapeHtml(row.key)}</strong>` : '-'}</td>`;
            html += `<td class="number-cell">${row.rows ? row.rows.toLocaleString() : '-'}</td>`;
            html += `<td class="number-cell">${row.filtered !== undefined ? row.filtered + '%' : '-'}</td>`;
            html += `<td class="number-cell">${row.cost !== undefined && row.cost !== null && typeof row.cost === 'number' && !isNaN(row.cost) ? row.cost.toFixed(2) : '-'}</td>`;
            html += '</tr>';

            // Add issues row if present
            if (row.issues && row.issues.length > 0) {
                html += `<tr class="severity-${severityClass} issues-row">`;
                html += `<td colspan="9" class="issues-cell">`;
                html += '<div class="issues-list">';
                row.issues.forEach(issue => {
                    html += `<div class="issue-item">${escapeHtml(issue)}</div>`;
                });
                html += '</div>';
                html += `</td>`;
                html += '</tr>';
            }
        });

        html += '</tbody></table>';
        html += '</div>';
        html += '</div>';

        tableContent.innerHTML = html;
    }

    function formatArray(arr) {
        if (!arr || arr.length === 0) return '-';
        return arr.map(item => escapeHtml(item)).join(', ');
    }

    function getCostClass(cost) {
        if (cost > 10000) return 'cost-critical';
        if (cost > 1000) return 'cost-warning';
        return 'cost-good';
    }

    function escapeHtml(text) {
        if (text === undefined || text === null) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    function collectTableRows(node, rows, level) {
        rows.push({
            level,
            type: node.type,
            table: node.table,
            accessType: node.accessType,
            possibleKeys: node.possibleKeys,
            key: node.key,
            rows: node.rows,
            filtered: node.filtered,
            cost: node.cost,
            issues: node.issues,
            severity: node.severity
        });

        if (node.children && node.children.length > 0) {
            node.children.forEach(child => collectTableRows(child, rows, level + 1));
        }
    }

    function toggleView() {
        currentView = currentView === 'tree' ? 'table' : 'tree';

        if (currentView === 'tree') {
            treeView.style.display = 'block';
            tableView.style.display = 'none';
        } else {
            treeView.style.display = 'none';
            tableView.style.display = 'block';
        }
    }

    function expandAll() {
        if (!currentData) return;

        // Reset all collapsed states (if we tracked them)
        // In D3 tree, all nodes start expanded by default
        renderTreeDiagram(currentData);

        vscode.postMessage({ type: 'log', message: 'All nodes expanded' });
    }

    function collapseAll() {
        if (!currentData || !treeDiagram) return;

        // Collapse all by removing SVG content
        // For a full implementation, we'd need to track state and re-render
        // But for now, just clear the tree
        treeDiagram.innerHTML = '';

        // Show collapsed message
        treeDiagram.innerHTML = '<div style="text-align: center; padding: 40px; color: #999;">Tree collapsed - Click "Expand All" to view</div>';

        vscode.postMessage({ type: 'log', message: 'All nodes collapsed' });
    }

    function handleExport(event) {
        if (!exportDropdown) return;
        const format = exportDropdown.value;
        if (!format) return;

        vscode.postMessage({
            type: 'export',
            format: format,
            data: currentData,
            rawJson: currentRawJson
        });

        // Reset dropdown
        exportDropdown.value = '';
    }

    function handleSearch(event) {
        if (!searchInput || !currentData || !treeDiagram) return;
        const searchTerm = searchInput.value.toLowerCase();

        if (!searchTerm) {
            // Reset view if search is cleared
            if (currentData) {
                renderTreeDiagram(currentData);
            }
            return;
        }

        // Performance: Only search, don't re-render entire tree
        // In a full implementation, we'd track search results and highlight them
        // For now, just log the search term
        vscode.postMessage({
            type: 'log',
            message: `Searching for: ${searchTerm}`
        });

        // TODO: Implement search highlighting without full re-render
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
