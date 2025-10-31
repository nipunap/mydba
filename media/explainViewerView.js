// @ts-check
(function () {
    'use strict';

    // ============================================================================
    // CONSTANTS & CONFIGURATION
    // ============================================================================

    /** @const {Object} Configuration constants for the explain viewer */
    const CONFIG = {
        ZOOM: { MIN: 0.5, MAX: 3 },
        DEBOUNCE_MS: 300,
        DIAGRAM: {
            WIDTH: 800,
            HEIGHT: 600,
            MARGIN: 40,
            NODE_RADIUS: 8,
            NODE_RADIUS_HOVER: 12,
            STROKE_WIDTH: 2,
            STROKE_WIDTH_HOVER: 3
        },
        COST_THRESHOLDS: { CRITICAL: 10000, WARNING: 1000 },
        ROWS_THRESHOLD: 10000,
        POPUP_ANIMATION: {
            FADE_IN_DELAY: 10,
            FADE_OUT_DELAY: 200,
            CLICK_OUTSIDE_DELAY: 100
        }
    };

    /** @const {Object} Message type constants */
    const MESSAGE_TYPES = {
        EXPLAIN_DATA: 'explainData',
        ERROR: 'error',
        AI_INSIGHTS_LOADING: 'aiInsightsLoading',
        AI_INSIGHTS: 'aiInsights',
        AI_INSIGHTS_ERROR: 'aiInsightsError',
        EXPORT: 'export',
        LOG: 'log'
    };

    /** @const {Object} View state constants */
    const VIEW_STATES = {
        LOADING: 'loading',
        ERROR: 'error',
        CONTENT: 'content'
    };

    /** @const {Object} Severity levels */
    const SEVERITY = {
        CRITICAL: 'critical',
        WARNING: 'warning',
        GOOD: 'good'
    };

    // ============================================================================
    // GLOBAL STATE
    // ============================================================================

    // @ts-ignore
    const vscode = acquireVsCodeApi();

    /** @type {any} */
    let currentData = null;
    /** @type {string} */
    let currentView = 'tree'; // 'tree' or 'table'
    /** @type {any} */
    let currentRawJson = null;
    /** @type {number|null} */
    let searchTimeout = null;
    /** @type {Set<string>} */
    let highlightedNodeIds = new Set();
    /** @type {Function|null} */
    let currentPopupCloseHandler = null;

    // Check D3 availability
    /** @type {any} */
    let d3;
    try {
        d3 = window.d3;
        if (!d3) {
            console.error('D3 library not available');
        }
    } catch (e) {
        console.error('Error loading D3 library:', e);
    }

    // ============================================================================
    // DOM ELEMENTS
    // ============================================================================

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
    const exportDropdown = document.getElementById('export-dropdown');
    const searchInput = document.getElementById('search-input');
    const searchClearBtn = document.getElementById('search-clear');
    const searchResults = document.getElementById('search-results');
    const aiInsightsLoading = document.getElementById('ai-insights-loading');
    const aiInsightsError = document.getElementById('ai-insights-error');
    const aiInsightsErrorMessage = document.getElementById('ai-insights-error-message');
    const aiInsightsContent = document.getElementById('ai-insights-content');

    // ============================================================================
    // UTILITY FUNCTIONS
    // ============================================================================

    /**
     * Checks if a value is a valid finite number
     * @param {any} value - The value to check
     * @returns {boolean} True if the value is a valid number
     */
    function isValidNumber(value) {
        return typeof value === 'number' && !isNaN(value) && isFinite(value);
    }

    /**
     * Escapes HTML to prevent XSS attacks
     * @param {any} text - The text to escape
     * @returns {string} The escaped HTML string
     */
    function escapeHtml(text) {
        if (text === undefined || text === null) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    /**
     * Sanitizes access type to prevent XSS via class names
     * @param {string} str - The access type string
     * @returns {string} Sanitized access type
     */
    function sanitizeAccessType(str) {
        if (typeof str !== 'string') return 'unknown';
        const allowedTypes = [
            'ALL', 'index', 'range', 'ref', 'eq_ref', 'const',
            'system', 'NULL', 'fulltext', 'ref_or_null',
            'index_merge', 'unique_subquery', 'index_subquery'
        ];
        return allowedTypes.includes(str) ? str : 'unknown';
    }

    /**
     * Sanitizes metric level values
     * @param {string} str - The metric level string
     * @returns {string} Sanitized metric level
     */
    function sanitizeMetricLevel(str) {
        if (typeof str !== 'string') return 'unknown';
        const allowedValues = ['low', 'medium', 'high', 'easy', 'hard'];
        const value = str.toLowerCase();
        return allowedValues.includes(value) ? value : 'unknown';
    }

    /**
     * Sanitizes color class names
     * @param {string} str - The color string
     * @returns {string} Sanitized color class name
     */
    function sanitizeColor(str) {
        if (typeof str !== 'string') return SEVERITY.GOOD;
        const allowedColors = [SEVERITY.GOOD, SEVERITY.WARNING, SEVERITY.CRITICAL];
        return allowedColors.includes(str) ? str : SEVERITY.GOOD;
    }

    /**
     * Formats an array as a comma-separated string with HTML escaping
     * @param {Array<any>} arr - The array to format
     * @returns {string} Formatted string or '-'
     */
    function formatArray(arr) {
        if (!arr || arr.length === 0) return '-';
        return arr.map(item => escapeHtml(item)).join(', ');
    }

    /**
     * Gets CSS class for cost values
     * @param {number} cost - The cost value
     * @returns {string} CSS class name
     */
    function getCostClass(cost) {
        if (cost > CONFIG.COST_THRESHOLDS.CRITICAL) return 'cost-critical';
        if (cost > CONFIG.COST_THRESHOLDS.WARNING) return 'cost-warning';
        return 'cost-good';
    }

    /**
     * Generates a unique ID for a node based on its properties
     * @param {Object} node - The node object
     * @param {number} index - The node index
     * @returns {string} Unique node ID
     */
    function generateNodeId(node, index) {
        return `node-${index}-${node.table || node.type || 'unknown'}`;
    }

    // ============================================================================
    // STATE MANAGEMENT
    // ============================================================================

    /**
     * View state manager for controlling UI states
     */
    const ViewState = {
        /**
         * Shows loading state
         */
        setLoading: function() {
            if (loading) loading.style.display = 'flex';
            if (error) error.style.display = 'none';
            if (content) content.style.display = 'none';
        },

        /**
         * Shows error state with message
         * @param {string} msg - Error message to display
         */
        setError: function(msg) {
            if (loading) loading.style.display = 'none';
            if (content) content.style.display = 'none';
            if (error && errorMessage) {
                errorMessage.textContent = msg;
                error.style.display = 'flex';
            }
        },

        /**
         * Shows content state (hides loading and error)
         */
        setContent: function() {
            if (loading) loading.style.display = 'none';
            if (error) error.style.display = 'none';
            if (content) content.style.display = 'block';
        }
    };

    /**
     * AI Insights state manager
     */
    const AIInsightsState = {
        /**
         * Shows AI insights loading state
         */
        setLoading: function() {
            if (aiInsightsLoading) aiInsightsLoading.style.display = 'flex';
            if (aiInsightsError) aiInsightsError.style.display = 'none';
            if (aiInsightsContent) aiInsightsContent.style.display = 'none';
        },

        /**
         * Shows AI insights error state
         * @param {string} msg - Error message
         */
        setError: function(msg) {
            if (aiInsightsLoading) aiInsightsLoading.style.display = 'none';
            if (aiInsightsContent) aiInsightsContent.style.display = 'none';
            if (aiInsightsError && aiInsightsErrorMessage) {
                aiInsightsErrorMessage.textContent = msg;
                aiInsightsError.style.display = 'flex';
            }
        },

        /**
         * Shows AI insights content
         */
        setContent: function() {
            if (aiInsightsLoading) aiInsightsLoading.style.display = 'none';
            if (aiInsightsError) aiInsightsError.style.display = 'none';
            if (aiInsightsContent) aiInsightsContent.style.display = 'block';
        }
    };

    // ============================================================================
    // EVENT LISTENERS
    // ============================================================================

    // View toggle button
    toggleViewBtn?.addEventListener('click', toggleView);

    // Export dropdown
    if (exportDropdown) {
        exportDropdown.addEventListener('change', handleExport);
    }

    // Search functionality
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            if (searchTimeout) {
                clearTimeout(searchTimeout);
            }
            searchTimeout = setTimeout(() => handleSearch(e), CONFIG.DEBOUNCE_MS);
        });

        // Keyboard support for search
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                clearSearch();
            }
        });
    }

    // Clear search button
    if (searchClearBtn) {
        searchClearBtn.addEventListener('click', clearSearch);
    }

    // Listen for messages from extension
    window.addEventListener('message', handleMessage);

    // Keyboard navigation for accessibility
    document.addEventListener('keydown', handleGlobalKeydown);

    // ============================================================================
    // MESSAGE HANDLING
    // ============================================================================

    /**
     * Handles messages from the VS Code extension
     * @param {MessageEvent} event - The message event
     */
    function handleMessage(event) {
        const message = event.data;

        // Validate message structure
        if (!message || typeof message.type !== 'string') {
            console.error('Invalid message format received:', message);
            return;
        }

        try {
            switch (message.type) {
                case MESSAGE_TYPES.EXPLAIN_DATA:
                    if (!message.data) {
                        throw new Error('Missing data in explainData message');
                    }
                    handleExplainData(message.data, message.query, message.rawJson);
                    break;

                case MESSAGE_TYPES.ERROR:
                    ViewState.setError(message.message || 'An unknown error occurred');
                    break;

                case MESSAGE_TYPES.AI_INSIGHTS_LOADING:
                    AIInsightsState.setLoading();
                    break;

                case MESSAGE_TYPES.AI_INSIGHTS:
                    if (!message.data) {
                        throw new Error('Missing data in aiInsights message');
                    }
                    showAIInsights(message.data);
                    break;

                case MESSAGE_TYPES.AI_INSIGHTS_ERROR:
                    AIInsightsState.setError(message.message || 'Failed to load AI insights');
                    break;

                default:
                    console.warn('Unknown message type:', message.type);
            }
        } catch (err) {
            console.error('Error handling message:', err);
            ViewState.setError(err.message || 'Error processing message');
        }
    }

    /**
     * Handles global keyboard shortcuts
     * @param {KeyboardEvent} e - The keyboard event
     */
    function handleGlobalKeydown(e) {
        // Escape key closes popup
        if (e.key === 'Escape') {
            const popup = document.querySelector('.node-detail-popup');
            if (popup) {
                closePopup(popup);
            }
        }
    }

    // ============================================================================
    // DATA HANDLING
    // ============================================================================

    /**
     * Handles incoming explain data from the extension
     * @param {Object} data - The explain data
     * @param {string} query - The SQL query
     * @param {Object} rawJsonData - Raw JSON from EXPLAIN
     */
    function handleExplainData(data, query, rawJsonData) {
        currentData = data;
        currentRawJson = rawJsonData;

        ViewState.setContent();

        // Display query
        if (queryText) {
            queryText.textContent = query || '';
        }

        // Display raw JSON
        if (rawJson) {
            rawJson.textContent = JSON.stringify(rawJsonData, null, 2);
        }

        // Render visualizations
        renderTreeDiagram(data);
        renderTableView(data);
    }

    // ============================================================================
    // TREE DIAGRAM RENDERING
    // ============================================================================

    /**
     * Renders the D3 tree diagram visualization
     * @param {Object} data - Hierarchical query execution plan data
     */
    function renderTreeDiagram(data) {
        if (!treeDiagram) return;

        // Check D3 availability
        if (!d3) {
            treeDiagram.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--vscode-errorForeground);">
                    <p><strong>D3 Visualization Library Not Available</strong></p>
                    <p>The tree diagram requires D3.js to render. Please ensure the library is loaded.</p>
                    <p>You can still view the table view and raw JSON.</p>
                </div>
            `;
            return;
        }

        // Clear existing content
        treeDiagram.innerHTML = '';

        const width = treeDiagram.clientWidth || CONFIG.DIAGRAM.WIDTH;
        const height = CONFIG.DIAGRAM.HEIGHT;

        // Create SVG
        const svg = d3.select(treeDiagram)
            .append('svg')
            .attr('width', width)
            .attr('height', height)
            .attr('role', 'img')
            .attr('aria-label', 'Query execution plan tree diagram')
            .style('background', 'var(--vscode-editor-background)');

        const g = svg.append('g')
            .attr('transform', `translate(${CONFIG.DIAGRAM.MARGIN},${CONFIG.DIAGRAM.MARGIN})`);

        // Create tree layout
        const treeLayout = d3.tree()
            .size([height - (CONFIG.DIAGRAM.MARGIN * 2), width - 200]);

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
            .attr('stroke-width', CONFIG.DIAGRAM.STROKE_WIDTH)
            .attr('d', d3.linkHorizontal()
                .x(d => d.y)
                .y(d => d.x));

        // Create nodes
        const nodes = g.selectAll('.node')
            .data(treeData.descendants())
            .enter()
            .append('g')
            .attr('class', 'node')
            .attr('transform', d => `translate(${d.y},${d.x})`)
            .attr('role', 'button')
            .attr('tabindex', '0')
            .attr('aria-label', d => {
                const table = d.data.table || d.data.type;
                const access = d.data.accessType || '';
                return `${table} ${access} node. Press Enter for details.`;
            });

        // Add circles for nodes
        nodes.append('circle')
            .attr('r', CONFIG.DIAGRAM.NODE_RADIUS)
            .attr('fill', d => getNodeColor(d.data.severity))
            .attr('stroke', '#fff')
            .attr('stroke-width', CONFIG.DIAGRAM.STROKE_WIDTH)
            .attr('class', d => {
                const nodeId = generateNodeId(d.data, d.depth);
                return highlightedNodeIds.has(nodeId) ? 'highlighted' : '';
            })
            .style('cursor', 'pointer')
            .style('transition', 'all 0.2s ease')
            .on('click', (event, d) => {
                event.stopPropagation();
                showNodeDetails(d.data, d.depth);
            })
            .on('mouseenter', function(event, d) {
                d3.select(this)
                    .attr('r', CONFIG.DIAGRAM.NODE_RADIUS_HOVER)
                    .attr('stroke-width', CONFIG.DIAGRAM.STROKE_WIDTH_HOVER);
            })
            .on('mouseleave', function(event, d) {
                d3.select(this)
                    .attr('r', CONFIG.DIAGRAM.NODE_RADIUS)
                    .attr('stroke-width', CONFIG.DIAGRAM.STROKE_WIDTH);
            });

        // Add keyboard interaction
        nodes.on('keydown', (event, d) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                showNodeDetails(d.data, d.depth);
            }
        });

        // Add labels
        nodes.append('text')
            .attr('dy', -15)
            .attr('x', 0)
            .style('text-anchor', 'middle')
            .style('fill', '#cccccc')
            .style('font-size', '12px')
            .style('font-weight', 'bold')
            .style('pointer-events', 'none')
            .text(d => {
                if (d.data.table) {
                    return `${d.data.table} (${d.data.accessType || 'N/A'})`;
                }
                return d.data.type || 'Unknown';
            });

        // Add row count
        nodes.filter(d => d.data.rows)
            .append('text')
            .attr('dy', 25)
            .attr('x', 0)
            .style('text-anchor', 'middle')
            .style('fill', '#999')
            .style('font-size', '10px')
            .style('pointer-events', 'none')
            .text(d => `${d.data.rows.toLocaleString()} rows`);

        // Add zoom behavior
        const zoom = d3.zoom()
            .scaleExtent([CONFIG.ZOOM.MIN, CONFIG.ZOOM.MAX])
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
            });

        svg.call(zoom);
    }

    /**
     * Gets the color for a node based on severity
     * @param {string} severity - The severity level
     * @returns {string} RGB color string
     */
    function getNodeColor(severity) {
        switch (severity) {
            case SEVERITY.CRITICAL:
                return 'rgb(255, 99, 132)'; // Red
            case SEVERITY.WARNING:
                return 'rgb(255, 206, 86)'; // Yellow
            case SEVERITY.GOOD:
                return 'rgb(75, 255, 192)'; // Green
            default:
                return 'rgb(201, 153, 255)'; // Purple
        }
    }

    // ============================================================================
    // NODE DETAILS POPUP
    // ============================================================================

    /**
     * Shows detailed information about a node in a popup
     * @param {Object} nodeData - The node data
     * @param {number} nodeIndex - The node index for ID generation
     */
    function showNodeDetails(nodeData, nodeIndex) {
        // Remove any existing popup
        const existing = document.querySelector('.node-detail-popup');
        if (existing) {
            closePopup(existing);
        }

        const details = [];

        // Header with severity badge
        const severityBadge = getSeverityBadge(nodeData.severity);
        details.push(`<div class="detail-header">`);
        details.push(`<h3>${escapeHtml(nodeData.type)}${nodeData.table ? ': ' + escapeHtml(nodeData.table) : ''}</h3>`);
        details.push(severityBadge);
        details.push(`</div>`);

        // Details grid
        details.push(`<div class="detail-grid">`);

        if (nodeData.accessType) {
            const safeAccessType = sanitizeAccessType(nodeData.accessType);
            const labelAccessType = escapeHtml(nodeData.accessType);
            details.push(`<div class="detail-item"><span class="detail-label">Access Type:</span> <span class="access-type-badge ${safeAccessType}">${labelAccessType}</span></div>`);
        }

        if (nodeData.key) {
            details.push(`<div class="detail-item"><span class="detail-label">Index Used:</span> <strong>${escapeHtml(nodeData.key)}</strong></div>`);
        }

        if (nodeData.possibleKeys && nodeData.possibleKeys.length > 0) {
            details.push(`<div class="detail-item"><span class="detail-label">Possible Keys:</span> ${formatArray(nodeData.possibleKeys)}</div>`);
        }

        if (nodeData.rows) {
            details.push(`<div class="detail-item"><span class="detail-label">Rows Examined:</span> <strong>${nodeData.rows.toLocaleString()}</strong></div>`);
        }

        if (nodeData.filtered !== undefined) {
            const filteredClass = nodeData.filtered < 10 ? SEVERITY.WARNING : SEVERITY.GOOD;
            details.push(`<div class="detail-item"><span class="detail-label">Filtered:</span> <span class="${filteredClass}">${escapeHtml(nodeData.filtered)}%</span></div>`);
        }

        if (isValidNumber(nodeData.cost)) {
            const costClass = nodeData.cost > CONFIG.COST_THRESHOLDS.CRITICAL
                ? SEVERITY.CRITICAL
                : (nodeData.cost > CONFIG.COST_THRESHOLDS.WARNING ? SEVERITY.WARNING : SEVERITY.GOOD);
            details.push(`<div class="detail-item"><span class="detail-label">Estimated Cost:</span> <span class="${costClass}"><strong>${nodeData.cost.toFixed(2)}</strong></span></div>`);
        }

        details.push(`</div>`);

        // Issues section
        if (nodeData.issues && nodeData.issues.length > 0) {
            details.push('<div class="detail-issues">');
            details.push('<h4>💡 Optimization Hints</h4>');
            details.push('<ul>');
            nodeData.issues.forEach(issue => {
                details.push(`<li>${escapeHtml(issue)}</li>`);
            });
            details.push('</ul>');
            details.push('</div>');
        }

        // Create popup
        const detailsHtml = details.join('');
        const popup = document.createElement('div');
        popup.className = 'node-detail-popup';
        popup.setAttribute('role', 'dialog');
        popup.setAttribute('aria-modal', 'true');
        popup.setAttribute('aria-labelledby', 'popup-title');
        popup.innerHTML = detailsHtml;

        // Add ID to title for aria-labelledby
        const title = popup.querySelector('h3');
        if (title) {
            title.id = 'popup-title';
        }

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.className = 'detail-close-btn';
        closeBtn.innerHTML = '×';
        closeBtn.setAttribute('aria-label', 'Close details popup');
        closeBtn.setAttribute('tabindex', '0');

        // Create close handler that removes event listener
        const closeOnOutside = (e) => {
            if (!popup.contains(e.target)) {
                closePopup(popup);
            }
        };

        closeBtn.onclick = () => {
            closePopup(popup);
        };

        // Keyboard support for close button
        closeBtn.onkeydown = (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                closePopup(popup);
            }
        };

        popup.appendChild(closeBtn);
        document.body.appendChild(popup);

        // Store reference to cleanup handler
        currentPopupCloseHandler = closeOnOutside;

        // Animate in
        setTimeout(() => popup.classList.add('visible'), CONFIG.POPUP_ANIMATION.FADE_IN_DELAY);

        // Focus the close button for accessibility
        setTimeout(() => closeBtn.focus(), CONFIG.POPUP_ANIMATION.FADE_IN_DELAY + 50);

        // Close on click outside (after a small delay)
        setTimeout(() => {
            document.addEventListener('click', closeOnOutside);
        }, CONFIG.POPUP_ANIMATION.CLICK_OUTSIDE_DELAY);
    }

    /**
     * Closes the popup and cleans up event listeners
     * @param {HTMLElement} popup - The popup element to close
     */
    function closePopup(popup) {
        if (currentPopupCloseHandler) {
            document.removeEventListener('click', currentPopupCloseHandler);
            currentPopupCloseHandler = null;
        }

        popup.classList.remove('visible');
        setTimeout(() => {
            if (popup.parentNode) {
                popup.parentNode.removeChild(popup);
            }
        }, CONFIG.POPUP_ANIMATION.FADE_OUT_DELAY);
    }

    /**
     * Gets the severity badge HTML
     * @param {string} severity - The severity level
     * @returns {string} HTML for the severity badge
     */
    function getSeverityBadge(severity) {
        const badges = {
            [SEVERITY.CRITICAL]: '<span class="severity-badge severity-critical">🔴 CRITICAL</span>',
            [SEVERITY.WARNING]: '<span class="severity-badge severity-warning">🟡 WARNING</span>',
            [SEVERITY.GOOD]: '<span class="severity-badge severity-good">🟢 GOOD</span>'
        };
        return badges[severity] || '<span class="severity-badge">ℹ️ INFO</span>';
    }

    // ============================================================================
    // TABLE VIEW RENDERING
    // ============================================================================

    /**
     * Renders the table view of the execution plan
     * @param {Object} data - The execution plan data
     */
    function renderTableView(data) {
        if (!tableContent) return;

        let html = '<div class="table-view-content">';

        // Query Summary Section
        html += '<div class="explain-section">';
        html += '<h4>Query Summary</h4>';
        html += '<table class="explain-detail-table">';
        html += '<tr><th>Property</th><th>Value</th></tr>';
        html += `<tr><td>Query Type</td><td>${escapeHtml(data.type)}</td></tr>`;

        if (isValidNumber(data.cost)) {
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

        html += '<table class="explain-table" role="table">';
        html += '<thead><tr>';
        html += '<th scope="col">Level</th>';
        html += '<th scope="col">Type</th>';
        html += '<th scope="col">Table</th>';
        html += '<th scope="col">Access Type</th>';
        html += '<th scope="col">Possible Keys</th>';
        html += '<th scope="col">Key Used</th>';
        html += '<th scope="col">Rows</th>';
        html += '<th scope="col">Filtered</th>';
        html += '<th scope="col">Cost</th>';
        html += '</tr></thead>';
        html += '<tbody>';

        rows.forEach((row, index) => {
            const severityClass = row.severity || '';
            const indent = '→ '.repeat(row.level);
            const nodeId = generateNodeId(row, index);
            const highlightClass = highlightedNodeIds.has(nodeId) ? ' highlighted' : '';

            html += `<tr class="severity-${severityClass}${highlightClass}" data-node-id="${escapeHtml(nodeId)}">`;
            html += `<td>${row.level}</td>`;
            html += `<td>${indent}${escapeHtml(row.type)}</td>`;
            html += `<td>${row.table ? escapeHtml(row.table) : '-'}</td>`;
            html += `<td>${row.accessType ? `<span class="access-type ${sanitizeAccessType(row.accessType)}">${escapeHtml(row.accessType)}</span>` : '-'}</td>`;
            html += `<td>${row.possibleKeys ? formatArray(row.possibleKeys) : '-'}</td>`;
            html += `<td>${row.key ? `<strong>${escapeHtml(row.key)}</strong>` : '-'}</td>`;
            html += `<td class="number-cell">${row.rows ? row.rows.toLocaleString() : '-'}</td>`;
            html += `<td class="number-cell">${row.filtered !== undefined ? escapeHtml(row.filtered + '%') : '-'}</td>`;
            html += `<td class="number-cell">${isValidNumber(row.cost) ? row.cost.toFixed(2) : '-'}</td>`;
            html += '</tr>';

            // Add issues row if present
            if (row.issues && row.issues.length > 0) {
                html += `<tr class="severity-${severityClass} issues-row${highlightClass}">`;
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

    /**
     * Recursively collects table rows from hierarchical data
     * @param {Object} node - The current node
     * @param {Array} rows - The array to collect rows into
     * @param {number} level - The current depth level
     */
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

    // ============================================================================
    // SEARCH FUNCTIONALITY
    // ============================================================================

    /**
     * Handles search input with debouncing
     * @param {Event} event - The input event
     */
    function handleSearch(event) {
        if (!searchInput || !currentData) return;

        const searchTerm = searchInput.value.trim().toLowerCase();

        if (!searchTerm) {
            clearSearch();
            return;
        }

        // Perform search
        highlightedNodeIds.clear();
        const results = searchNodes(currentData, searchTerm, 0);

        // Update UI
        updateSearchResults(results, searchTerm);

        // Re-render with highlights
        if (currentView === 'tree') {
            renderTreeDiagram(currentData);
        } else {
            renderTableView(currentData);
        }

        // Show clear button
        if (searchClearBtn) {
            searchClearBtn.style.display = 'inline-block';
        }

        // Log search for debugging
        vscode.postMessage({
            type: MESSAGE_TYPES.LOG,
            message: `Search found ${results.length} matches for: ${searchTerm}`
        });
    }

    /**
     * Recursively searches nodes for matching terms
     * @param {Object} node - The node to search
     * @param {string} searchTerm - The search term
     * @param {number} index - The node index
     * @returns {Array} Array of matching node IDs
     */
    function searchNodes(node, searchTerm, index) {
        const results = [];
        const nodeId = generateNodeId(node, index);

        // Search in various node properties
        const searchableText = [
            node.type,
            node.table,
            node.accessType,
            node.key,
            ...(node.possibleKeys || []),
            ...(node.issues || [])
        ].filter(Boolean).join(' ').toLowerCase();

        if (searchableText.includes(searchTerm)) {
            results.push(nodeId);
            highlightedNodeIds.add(nodeId);
        }

        // Search children
        if (node.children && node.children.length > 0) {
            node.children.forEach((child, childIndex) => {
                const childResults = searchNodes(child, searchTerm, childIndex);
                results.push(...childResults);
            });
        }

        return results;
    }

    /**
     * Updates the search results display
     * @param {Array} results - Array of result node IDs
     * @param {string} searchTerm - The search term used
     */
    function updateSearchResults(results, searchTerm) {
        if (!searchResults) return;

        if (results.length === 0) {
            searchResults.innerHTML = `
                <div class="search-no-results" role="status">
                    No results found for "${escapeHtml(searchTerm)}"
                </div>
            `;
            searchResults.style.display = 'block';
        } else {
            searchResults.innerHTML = `
                <div class="search-results-count" role="status" aria-live="polite">
                    Found ${results.length} match${results.length !== 1 ? 'es' : ''} for "${escapeHtml(searchTerm)}"
                </div>
            `;
            searchResults.style.display = 'block';
        }
    }

    /**
     * Clears the search and resets highlights
     */
    function clearSearch() {
        if (searchInput) {
            searchInput.value = '';
        }

        if (searchClearBtn) {
            searchClearBtn.style.display = 'none';
        }

        if (searchResults) {
            searchResults.style.display = 'none';
            searchResults.innerHTML = '';
        }

        highlightedNodeIds.clear();

        // Re-render without highlights
        if (currentData) {
            if (currentView === 'tree') {
                renderTreeDiagram(currentData);
            } else {
                renderTableView(currentData);
            }
        }
    }

    // ============================================================================
    // VIEW CONTROLS
    // ============================================================================

    /**
     * Toggles between tree and table view
     */
    function toggleView() {
        currentView = currentView === 'tree' ? 'table' : 'tree';

        if (currentView === 'tree') {
            if (treeView) treeView.style.display = 'block';
            if (tableView) tableView.style.display = 'none';
            if (toggleViewBtn) toggleViewBtn.textContent = 'Switch to Table View';
            toggleViewBtn?.setAttribute('aria-label', 'Switch to table view');
        } else {
            if (treeView) treeView.style.display = 'none';
            if (tableView) tableView.style.display = 'block';
            if (toggleViewBtn) toggleViewBtn.textContent = 'Switch to Tree View';
            toggleViewBtn?.setAttribute('aria-label', 'Switch to tree view');
        }
    }

    /**
     * Handles export functionality
     * @param {Event} event - The change event
     */
    function handleExport(event) {
        if (!exportDropdown) return;
        const format = exportDropdown.value;
        if (!format) return;

        vscode.postMessage({
            type: MESSAGE_TYPES.EXPORT,
            format: format,
            data: currentData,
            rawJson: currentRawJson
        });

        // Reset dropdown
        exportDropdown.value = '';
    }

    // ============================================================================
    // AI INSIGHTS
    // ============================================================================

    /**
     * Shows AI insights in the panel
     * @param {Object} data - The AI insights data
     */
    function showAIInsights(data) {
        AIInsightsState.setContent();

        if (!aiInsightsContent) return;

        let html = '';

        // Summary section
        if (data.summary) {
            html += '<div class="ai-summary">';
            html += '<h4><span class="codicon codicon-info"></span> Summary</h4>';
            html += `<p>${escapeHtml(data.summary)}</p>`;
            html += '</div>';
        }

        // Metadata badges
        if (data.metadata) {
            html += '<div class="ai-metadata">';

            if (data.metadata.totalCost > 0) {
                const costClass = data.metadata.totalCost > CONFIG.COST_THRESHOLDS.CRITICAL
                    ? SEVERITY.CRITICAL
                    : (data.metadata.totalCost > CONFIG.COST_THRESHOLDS.WARNING ? SEVERITY.WARNING : SEVERITY.GOOD);
                const safeCostClass = sanitizeColor(costClass);
                html += `<span class="metric-badge ${safeCostClass}">Cost: ${data.metadata.totalCost.toFixed(2)}</span>`;
            }

            if (data.metadata.estimatedRows > 0) {
                const rowsClass = data.metadata.estimatedRows > CONFIG.ROWS_THRESHOLD ? SEVERITY.WARNING : SEVERITY.GOOD;
                const safeRowsClass = sanitizeColor(rowsClass);
                html += `<span class="metric-badge ${safeRowsClass}">Rows: ${data.metadata.estimatedRows.toLocaleString()}</span>`;
            }

            if (data.metadata.tablesCount > 0) {
                html += `<span class="metric-badge">Tables: ${data.metadata.tablesCount}</span>`;
            }

            if (data.estimatedComplexity) {
                const complexityClass = data.estimatedComplexity > 7
                    ? SEVERITY.CRITICAL
                    : (data.estimatedComplexity > 4 ? SEVERITY.WARNING : SEVERITY.GOOD);
                const safeComplexityClass = sanitizeColor(complexityClass);
                html += `<span class="metric-badge ${safeComplexityClass}">Complexity: ${data.estimatedComplexity}/10</span>`;
            }

            html += '</div>';
        }

        // Anti-patterns section
        if (data.antiPatterns && data.antiPatterns.length > 0) {
            html += '<div class="ai-antipatterns">';
            html += '<h4><span class="codicon codicon-warning"></span> Anti-Patterns Detected</h4>';
            html += '<div class="antipatterns-list">';

            data.antiPatterns.forEach(pattern => {
                const severityIcon = pattern.severity === SEVERITY.CRITICAL
                    ? '🔴'
                    : pattern.severity === SEVERITY.WARNING ? '🟡' : 'ℹ️';
                const safeSeverity = sanitizeColor(pattern.severity);

                html += `<div class="antipattern-item severity-${safeSeverity}">`;
                html += `<div class="antipattern-header">`;
                html += `<span class="severity-icon">${severityIcon}</span>`;
                html += `<strong>${escapeHtml(pattern.type || 'Issue')}</strong>`;
                html += `<span class="severity-badge-small">${escapeHtml(pattern.severity)}</span>`;
                html += `</div>`;
                html += `<div class="antipattern-message">${escapeHtml(pattern.message)}</div>`;

                if (pattern.suggestion) {
                    html += `<div class="antipattern-suggestion">`;
                    html += `<span class="codicon codicon-lightbulb"></span>`;
                    html += `<span>${escapeHtml(pattern.suggestion)}</span>`;
                    html += `</div>`;
                }

                html += `</div>`;
            });

            html += '</div>';
            html += '</div>';
        }

        // Optimization suggestions section
        if (data.optimizationSuggestions && data.optimizationSuggestions.length > 0) {
            html += '<div class="ai-optimizations">';
            html += '<h4><span class="codicon codicon-rocket"></span> Optimization Suggestions</h4>';
            html += '<div class="optimizations-list">';

            data.optimizationSuggestions.forEach((suggestion, index) => {
                const impactColor = suggestion.impact === 'high'
                    ? SEVERITY.CRITICAL
                    : suggestion.impact === 'medium' ? SEVERITY.WARNING : SEVERITY.GOOD;
                const difficultyColor = suggestion.difficulty === 'hard'
                    ? SEVERITY.CRITICAL
                    : suggestion.difficulty === 'medium' ? SEVERITY.WARNING : SEVERITY.GOOD;
                const safeImpactColor = sanitizeColor(impactColor);
                const safeDifficultyColor = sanitizeColor(difficultyColor);

                html += `<div class="optimization-item">`;
                html += `<div class="optimization-header">`;
                html += `<span class="optimization-number">${index + 1}</span>`;
                html += `<strong>${escapeHtml(suggestion.title)}</strong>`;
                html += `<div class="optimization-badges">`;
                html += `<span class="badge badge-impact ${safeImpactColor}">Impact: ${escapeHtml(suggestion.impact)}</span>`;
                html += `<span class="badge badge-difficulty ${safeDifficultyColor}">Difficulty: ${escapeHtml(suggestion.difficulty)}</span>`;
                html += `</div>`;
                html += `</div>`;
                html += `<div class="optimization-description">${escapeHtml(suggestion.description)}</div>`;

                // Show before/after code if available
                if (suggestion.before || suggestion.after) {
                    html += `<div class="optimization-code">`;

                    if (suggestion.before) {
                        html += `<div class="code-block">`;
                        html += `<div class="code-label">Before:</div>`;
                        html += `<pre><code>${escapeHtml(suggestion.before)}</code></pre>`;
                        html += `</div>`;
                    }

                    if (suggestion.after) {
                        html += `<div class="code-block">`;
                        html += `<div class="code-label">After:</div>`;
                        html += `<pre><code>${escapeHtml(suggestion.after)}</code></pre>`;
                        html += `</div>`;
                    }

                    html += `</div>`;
                }

                html += `</div>`;
            });

            html += '</div>';
            html += '</div>';
        }

        aiInsightsContent.innerHTML = html;
    }

})();
