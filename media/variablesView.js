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
    let currentEditingVariable = null;
    let variableHistory = new Map(); // For rollback capability

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

    // Modal elements
    const editModal = document.getElementById('edit-modal');
    const modalClose = document.getElementById('modal-close');
    const cancelBtn = document.getElementById('cancel-btn');
    const saveBtn = document.getElementById('save-btn');
    const editVarName = document.getElementById('edit-var-name');
    const editVarValue = document.getElementById('edit-var-value');
    const validationMessage = document.getElementById('validation-message');
    const varCategory = document.getElementById('var-category');
    const varRisk = document.getElementById('var-risk');
    const varCurrent = document.getElementById('var-current');
    const varDescription = document.getElementById('var-description');
    const varRecommendation = document.getElementById('var-recommendation');

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

    // Modal event listeners
    modalClose?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);
    saveBtn?.addEventListener('click', saveVariable);

    editVarValue?.addEventListener('input', debounce((e) => {
        if (currentEditingVariable) {
            vscode.postMessage({
                type: 'validateVariable',
                name: currentEditingVariable.name,
                value: e.target.value
            });
        }
    }, 300));

    // Close modal on ESC key
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && editModal.style.display === 'flex') {
            closeModal();
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
            case 'validationResult':
                handleValidationResult(message.name, message.valid, message.message);
                break;
            case 'editSuccess':
                handleEditSuccess(message.name, message.value);
                break;
            case 'editError':
                handleEditError(message.name, message.message);
                break;
            case 'editCancelled':
                closeModal();
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

            if (aVal == null) { return 1; }
            if (bVal == null) { return -1; }

            if (typeof aVal === 'string') {
                aVal = aVal.toLowerCase();
                bVal = bVal.toLowerCase();
            }

            if (aVal < bVal) { return sortDirection === 'asc' ? -1 : 1; }
            if (aVal > bVal) { return sortDirection === 'asc' ? 1 : -1; }
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

            // Name with risk indicator
            const nameCell = document.createElement('td');
            nameCell.classList.add('name-cell');

            const nameWrapper = document.createElement('div');
            nameWrapper.classList.add('name-wrapper');

            const nameSpan = document.createElement('span');
            nameSpan.textContent = variable.name;
            nameWrapper.appendChild(nameSpan);

            // Add risk indicator badge
            if (variable.metadata) {
                const riskBadge = document.createElement('span');
                riskBadge.classList.add('risk-indicator', `risk-${variable.metadata.risk}`);
                riskBadge.textContent = variable.metadata.risk.charAt(0).toUpperCase() + variable.metadata.risk.slice(1);
                riskBadge.title = `Risk Level: ${variable.metadata.risk}`;
                nameWrapper.appendChild(riskBadge);
            }

            nameCell.appendChild(nameWrapper);
            row.appendChild(nameCell);

            // Value
            const valueCell = createCell(variable.value, 'td');
            valueCell.classList.add('value-cell');
            row.appendChild(valueCell);

            // Actions
            const actionsCell = document.createElement('td');
            actionsCell.classList.add('actions-cell');

            const editBtn = document.createElement('button');
            editBtn.classList.add('action-btn', 'edit-btn');
            editBtn.innerHTML = '<span class="codicon codicon-edit"></span>';
            editBtn.title = 'Edit Variable';
            editBtn.addEventListener('click', () => openEditModal(variable));

            const rollbackBtn = document.createElement('button');
            rollbackBtn.classList.add('action-btn', 'rollback-btn');
            rollbackBtn.innerHTML = '<span class="codicon codicon-discard"></span>';
            rollbackBtn.title = 'Rollback to Previous Value';
            rollbackBtn.disabled = !variableHistory.has(variable.name);
            rollbackBtn.addEventListener('click', () => rollbackVariable(variable));

            actionsCell.appendChild(editBtn);
            actionsCell.appendChild(rollbackBtn);
            row.appendChild(actionsCell);

            variablesTbody.appendChild(row);
        });

        updateCount();
    }

    function openEditModal(variable) {
        currentEditingVariable = variable;

        // Populate modal
        editVarName.value = variable.name;
        editVarValue.value = variable.value;
        varCurrent.textContent = variable.value;
        validationMessage.textContent = '';
        validationMessage.className = 'validation-message';

        if (variable.metadata) {
            varCategory.textContent = variable.metadata.category || 'Other';
            varRisk.textContent = variable.metadata.risk.charAt(0).toUpperCase() + variable.metadata.risk.slice(1);
            varRisk.className = `risk-badge risk-${variable.metadata.risk}`;
            varDescription.textContent = variable.metadata.description || 'No description available';
            varRecommendation.textContent = variable.metadata.recommendation || 'Consult MySQL documentation';
        }

        // Show modal
        editModal.style.display = 'flex';
        editVarValue.focus();
        editVarValue.select();
    }

    function closeModal() {
        editModal.style.display = 'none';
        currentEditingVariable = null;
        editVarValue.value = '';
        validationMessage.textContent = '';
    }

    function saveVariable() {
        if (!currentEditingVariable) {
            return;
        }

        const newValue = editVarValue.value.trim();
        if (!newValue) {
            showValidationError('Value cannot be empty');
            return;
        }

        // Store current value for rollback
        if (!variableHistory.has(currentEditingVariable.name)) {
            variableHistory.set(currentEditingVariable.name, currentEditingVariable.value);
        }

        // Send edit request
        vscode.postMessage({
            type: 'editVariable',
            name: currentEditingVariable.name,
            value: newValue,
            scope: currentScope
        });

        // Show saving state
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
    }

    function rollbackVariable(variable) {
        const previousValue = variableHistory.get(variable.name);
        if (!previousValue) {
            return;
        }

        const confirm = window.confirm(`Rollback '${variable.name}' to previous value: ${previousValue}?`);
        if (!confirm) {
            return;
        }

        vscode.postMessage({
            type: 'editVariable',
            name: variable.name,
            value: previousValue,
            scope: currentScope
        });

        // Clear history entry after rollback
        variableHistory.delete(variable.name);
    }

    function handleValidationResult(name, valid, message) {
        if (currentEditingVariable && currentEditingVariable.name === name) {
            if (valid) {
                showValidationSuccess(message);
                saveBtn.disabled = false;
            } else {
                showValidationError(message);
                saveBtn.disabled = true;
            }
        }
    }

    function showValidationSuccess(message) {
        validationMessage.textContent = message;
        validationMessage.className = 'validation-message success';
    }

    function showValidationError(message) {
        validationMessage.textContent = message;
        validationMessage.className = 'validation-message error';
    }

    function handleEditSuccess(name, value) {
        closeModal();
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Changes';

        // Update the variable in the list
        const variable = allVariables.find(v => v.name === name);
        if (variable) {
            variable.value = value;
            renderVariables(allVariables);
        }
    }

    function handleEditError(name, message) {
        showValidationError(message);
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Changes';
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

    // Initialize
    vscode.postMessage({ type: 'refresh' });
})();
