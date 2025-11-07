// @ts-check
(function () {
    // @ts-ignore
    const vscode = acquireVsCodeApi();

    // Global error boundary
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

    let currentHistory = [];
    let currentStats = null;

    // DOM elements
    const loading = document.getElementById('loading');
    const error = document.getElementById('error');
    const errorMessage = document.getElementById('error-message');
    const historyList = document.getElementById('history-list');
    const historyEntries = document.getElementById('history-entries');
    const historyCount = document.getElementById('history-count');
    const lastUpdated = document.getElementById('last-updated');
    const searchInput = document.getElementById('search-input');
    const filterFavorites = document.getElementById('filter-favorites');
    const filterSuccess = document.getElementById('filter-success');
    const refreshBtn = document.getElementById('refresh-btn');
    const exportBtn = document.getElementById('export-btn');
    const importBtn = document.getElementById('import-btn');
    const clearAllBtn = document.getElementById('clear-all-btn');
    const statsBtn = document.getElementById('stats-btn');
    const statsModal = document.getElementById('stats-modal');
    const statsClose = document.getElementById('stats-close');
    const statsContent = document.getElementById('stats-content');

    // Event listeners
    refreshBtn?.addEventListener('click', () => {
        vscode.postMessage({ type: 'refresh' });
    });

    searchInput?.addEventListener('input', debounce((e) => {
        const searchText = e.target.value;
        if (searchText.trim()) {
            vscode.postMessage({ type: 'search', searchText: searchText });
        } else {
            renderHistory(currentHistory);
        }
    }, 300));

    filterFavorites?.addEventListener('change', (e) => {
        applyFilters();
    });

    filterSuccess?.addEventListener('change', (e) => {
        applyFilters();
    });

    exportBtn?.addEventListener('click', () => {
        showExportDialog();
    });

    importBtn?.addEventListener('click', () => {
        vscode.postMessage({ type: 'import' });
    });

    clearAllBtn?.addEventListener('click', () => {
        vscode.postMessage({ type: 'clearAll' });
    });

    statsBtn?.addEventListener('click', () => {
        vscode.postMessage({ type: 'getStats' });
    });

    statsClose?.addEventListener('click', () => {
        if (statsModal) {
            statsModal.style.display = 'none';
        }
    });

    // Close modal on outside click
    statsModal?.addEventListener('click', (e) => {
        if (e.target === statsModal) {
            statsModal.style.display = 'none';
        }
    });

    // Listen for messages from extension
    window.addEventListener('message', event => {
        const message = event.data;

        switch (message.type) {
            case 'historyLoaded':
                handleHistoryLoaded(message.history, message.stats, message.timestamp);
                break;
            case 'searchResults':
                renderHistory(message.results);
                break;
            case 'filterResults':
                renderHistory(message.results);
                break;
            case 'stats':
                showStats(message.stats);
                break;
            case 'favoriteToggled':
                updateFavoriteUI(message.id, message.isFavorite);
                break;
            case 'error':
                handleError(message.message);
                break;
        }
    });

    function handleHistoryLoaded(history, stats, timestamp) {
        currentHistory = history;
        currentStats = stats;
        hideLoading();
        hideError();
        showHistoryList();
        renderHistory(history);
        if (lastUpdated) {
            lastUpdated.textContent = `Last updated: ${new Date(timestamp).toLocaleTimeString()}`;
        }
    }

    function renderHistory(entries) {
        historyEntries.innerHTML = '';

        if (!entries || entries.length === 0) {
            historyEntries.innerHTML = '<div class="empty-state"><span class="codicon codicon-inbox"></span><p>No queries in history</p></div>';
            if (historyCount) {
                historyCount.textContent = '';
            }
            return;
        }

        entries.forEach(entry => {
            const card = createHistoryCard(entry);
            historyEntries.appendChild(card);
        });

        if (historyCount) {
            historyCount.textContent = `${entries.length} ${entries.length === 1 ? 'query' : 'queries'}`;
        }
    }

    function createHistoryCard(entry) {
        const card = document.createElement('div');
        card.className = 'history-card';
        card.dataset.id = entry.id;

        // Header
        const header = document.createElement('div');
        header.className = 'card-header';

        const timestamp = document.createElement('span');
        timestamp.className = 'timestamp';
        timestamp.textContent = new Date(entry.timestamp).toLocaleString();

        const connection = document.createElement('span');
        connection.className = 'connection-name';
        connection.textContent = entry.connectionName;

        const status = document.createElement('span');
        status.className = `status-badge ${entry.success ? 'success' : 'error'}`;
        status.textContent = entry.success ? '✓ Success' : '✗ Error';

        const favoriteBtn = document.createElement('button');
        favoriteBtn.className = 'icon-btn favorite-btn' + (entry.isFavorite ? ' active' : '');
        favoriteBtn.innerHTML = '<span class="codicon codicon-star-full"></span>';
        favoriteBtn.title = entry.isFavorite ? 'Remove from favorites' : 'Add to favorites';
        favoriteBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'toggleFavorite', id: entry.id });
        });

        header.appendChild(timestamp);
        header.appendChild(connection);
        header.appendChild(status);
        header.appendChild(favoriteBtn);

        // Query
        const querySection = document.createElement('div');
        querySection.className = 'query-section';
        
        const queryPre = document.createElement('pre');
        queryPre.className = 'query-text';
        queryPre.textContent = entry.query;
        
        querySection.appendChild(queryPre);

        // Metadata
        const metadata = document.createElement('div');
        metadata.className = 'metadata';

        if (entry.database) {
            metadata.innerHTML += `<div><span class="label">Database:</span> ${escapeHtml(entry.database)}</div>`;
        }
        metadata.innerHTML += `<div><span class="label">Duration:</span> ${formatDuration(entry.duration)}</div>`;
        metadata.innerHTML += `<div><span class="label">Rows:</span> ${entry.rowsAffected}</div>`;

        if (entry.error) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message-card';
            errorDiv.innerHTML = `<span class="codicon codicon-error"></span> ${escapeHtml(entry.error)}`;
            metadata.appendChild(errorDiv);
        }

        // Tags
        if (entry.tags && entry.tags.length > 0) {
            const tagsDiv = document.createElement('div');
            tagsDiv.className = 'tags';
            entry.tags.forEach(tag => {
                const tagSpan = document.createElement('span');
                tagSpan.className = 'tag';
                tagSpan.textContent = tag;
                tagsDiv.appendChild(tagSpan);
            });
            metadata.appendChild(tagsDiv);
        }

        // Notes
        if (entry.notes) {
            const notesDiv = document.createElement('div');
            notesDiv.className = 'notes';
            notesDiv.innerHTML = `<span class="codicon codicon-note"></span> ${escapeHtml(entry.notes)}`;
            metadata.appendChild(notesDiv);
        }

        // Actions
        const actions = document.createElement('div');
        actions.className = 'card-actions';

        const replayBtn = createActionButton('Replay', 'debug-start', () => {
            vscode.postMessage({ type: 'replay', id: entry.id });
        });

        const editNotesBtn = createActionButton('Notes', 'note', () => {
            editNotes(entry);
        });

        const editTagsBtn = createActionButton('Tags', 'tag', () => {
            editTags(entry);
        });

        const deleteBtn = createActionButton('Delete', 'trash', () => {
            vscode.postMessage({ type: 'delete', id: entry.id });
        });

        actions.appendChild(replayBtn);
        actions.appendChild(editNotesBtn);
        actions.appendChild(editTagsBtn);
        actions.appendChild(deleteBtn);

        // Assemble card
        card.appendChild(header);
        card.appendChild(querySection);
        card.appendChild(metadata);
        card.appendChild(actions);

        return card;
    }

    function createActionButton(text, icon, onClick) {
        const btn = document.createElement('button');
        btn.className = 'action-btn';
        btn.innerHTML = `<span class="codicon codicon-${icon}"></span> ${text}`;
        btn.addEventListener('click', onClick);
        return btn;
    }

    function editNotes(entry) {
        const notes = prompt('Edit notes:', entry.notes || '');
        if (notes !== null) {
            vscode.postMessage({
                type: 'updateNotes',
                id: entry.id,
                notes: notes
            });
        }
    }

    function editTags(entry) {
        const tagsStr = prompt('Edit tags (comma-separated):', (entry.tags || []).join(', '));
        if (tagsStr !== null) {
            const tags = tagsStr.split(',').map(t => t.trim()).filter(t => t.length > 0);
            vscode.postMessage({
                type: 'updateTags',
                id: entry.id,
                tags: tags
            });
        }
    }

    function applyFilters() {
        const options = {};
        
        if (filterFavorites && filterFavorites.checked) {
            options.onlyFavorites = true;
        }
        
        if (filterSuccess && filterSuccess.checked) {
            options.successOnly = true;
        }

        if (Object.keys(options).length > 0) {
            vscode.postMessage({ type: 'filter', options: options });
        } else {
            renderHistory(currentHistory);
        }
    }

    function showExportDialog() {
        const format = confirm('Export as JSON? (Cancel for CSV)') ? 'json' : 'csv';
        vscode.postMessage({ type: 'export', format: format });
    }

    function showStats(stats) {
        if (!stats || !statsContent || !statsModal) {
            return;
        }

        statsContent.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${stats.totalQueries}</div>
                    <div class="stat-label">Total Queries</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.successRate.toFixed(1)}%</div>
                    <div class="stat-label">Success Rate</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${formatDuration(stats.avgDuration)}</div>
                    <div class="stat-label">Avg Duration</div>
                </div>
            </div>
            
            <div class="stats-section">
                <h4>Most Frequently Executed</h4>
                <table class="stats-table">
                    <thead>
                        <tr>
                            <th>Query</th>
                            <th>Count</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${stats.mostFrequent.slice(0, 5).map(item => `
                            <tr>
                                <td><code>${escapeHtml(truncate(item.query, 80))}</code></td>
                                <td>${item.count}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            
            ${stats.recentErrors.length > 0 ? `
            <div class="stats-section">
                <h4>Recent Errors</h4>
                <table class="stats-table">
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>Query</th>
                            <th>Error</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${stats.recentErrors.slice(0, 5).map(entry => `
                            <tr>
                                <td>${new Date(entry.timestamp).toLocaleTimeString()}</td>
                                <td><code>${escapeHtml(truncate(entry.query, 40))}</code></td>
                                <td class="error-text">${escapeHtml(truncate(entry.error || '', 60))}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            ` : ''}
        `;

        statsModal.style.display = 'flex';
    }

    function updateFavoriteUI(id, isFavorite) {
        const card = document.querySelector(`.history-card[data-id="${id}"]`);
        if (card) {
            const favoriteBtn = card.querySelector('.favorite-btn');
            if (favoriteBtn) {
                if (isFavorite) {
                    favoriteBtn.classList.add('active');
                    favoriteBtn.title = 'Remove from favorites';
                } else {
                    favoriteBtn.classList.remove('active');
                    favoriteBtn.title = 'Add to favorites';
                }
            }
        }
    }

    function formatDuration(ms) {
        if (ms < 1000) {
            return `${ms.toFixed(0)}ms`;
        } else if (ms < 60000) {
            return `${(ms / 1000).toFixed(2)}s`;
        } else {
            const minutes = Math.floor(ms / 60000);
            const seconds = ((ms % 60000) / 1000).toFixed(0);
            return `${minutes}m ${seconds}s`;
        }
    }

    function truncate(str, maxLength) {
        if (str.length <= maxLength) {
            return str;
        }
        return str.substring(0, maxLength) + '...';
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    function showLoading() {
        if (loading) loading.style.display = 'flex';
        if (error) error.style.display = 'none';
        if (historyList) historyList.style.display = 'none';
    }

    function hideLoading() {
        if (loading) loading.style.display = 'none';
    }

    function showHistoryList() {
        if (historyList) historyList.style.display = 'block';
    }

    function handleError(message) {
        hideLoading();
        if (error) error.style.display = 'flex';
        if (historyList) historyList.style.display = 'none';
        if (errorMessage) errorMessage.textContent = message;
    }

    function hideError() {
        if (error) error.style.display = 'none';
    }

    // Initialize
    vscode.postMessage({ type: 'refresh' });
})();

