// @ts-check
(function () {
    // @ts-ignore
    const vscode = acquireVsCodeApi();

    // DOM elements
    const form = document.getElementById('connection-form');
    const nameField = document.getElementById('connection-name');
    const typeField = document.getElementById('connection-type');
    const hostField = document.getElementById('host');
    const portField = document.getElementById('port');
    const usernameField = document.getElementById('username');
    const passwordField = document.getElementById('password');
    const databaseField = document.getElementById('database');

    const sslEnabledCheckbox = document.getElementById('ssl-enabled');
    const sslOptions = document.getElementById('ssl-options');
    const sslVerifyCheckbox = document.getElementById('ssl-verify');
    const sslCaField = document.getElementById('ssl-ca');
    const sslCertField = document.getElementById('ssl-cert');
    const sslKeyField = document.getElementById('ssl-key');

    const browseCaBtn = document.getElementById('browse-ca');
    const browseCertBtn = document.getElementById('browse-cert');
    const browseKeyBtn = document.getElementById('browse-key');

    const testBtn = document.getElementById('test-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const saveBtn = document.getElementById('save-btn');
    const statusMessage = document.getElementById('status-message');
    const productionWarning = document.getElementById('production-warning');

    // Event listeners
    sslEnabledCheckbox?.addEventListener('change', (e) => {
        if (sslOptions) {
            sslOptions.style.display = e.target.checked ? 'block' : 'none';
        }
    });

    hostField?.addEventListener('input', checkProductionHost);

    browseCaBtn?.addEventListener('click', () => browseFile('sslCa'));
    browseCertBtn?.addEventListener('click', () => browseFile('sslCert'));
    browseKeyBtn?.addEventListener('click', () => browseFile('sslKey'));

    testBtn?.addEventListener('click', testConnection);
    cancelBtn?.addEventListener('click', cancel);
    saveBtn?.addEventListener('click', saveConnection);

    // Listen for messages from extension
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
            case 'loadConnection':
                loadConnectionData(message.config);
                break;
            case 'testResult':
                handleTestResult(message.success, message.message);
                break;
            case 'saveError':
                showError(message.message);
                break;
            case 'certFileSelected':
                handleCertFileSelected(message.field, message.path);
                break;
        }
    });

    function loadConnectionData(config) {
        if (nameField) nameField.value = config.name || '';
        if (typeField) typeField.value = config.type || 'mysql';
        if (hostField) hostField.value = config.host || '127.0.0.1';
        if (portField) portField.value = config.port || 3306;
        if (usernameField) usernameField.value = config.username || 'root';
        if (databaseField) databaseField.value = config.database || '';

        // SSL settings
        if (config.ssl) {
            if (sslEnabledCheckbox) sslEnabledCheckbox.checked = true;
            if (sslOptions) sslOptions.style.display = 'block';

            if (sslVerifyCheckbox) {
                sslVerifyCheckbox.checked = config.ssl.rejectUnauthorized !== false;
            }
            if (sslCaField && config.ssl.ca) sslCaField.value = config.ssl.ca;
            if (sslCertField && config.ssl.cert) sslCertField.value = config.ssl.cert;
            if (sslKeyField && config.ssl.key) sslKeyField.value = config.ssl.key;
        }

        checkProductionHost();
    }

    function getFormData() {
        return {
            name: nameField?.value?.trim() || '',
            type: typeField?.value || 'mysql',
            host: hostField?.value?.trim() || '127.0.0.1',
            port: parseInt(portField?.value) || 3306,
            username: usernameField?.value?.trim() || 'root',
            password: passwordField?.value || '',
            database: databaseField?.value?.trim() || undefined,
            sslEnabled: sslEnabledCheckbox?.checked || false,
            sslVerify: sslVerifyCheckbox?.checked || false,
            sslCa: sslCaField?.value?.trim() || undefined,
            sslCert: sslCertField?.value?.trim() || undefined,
            sslKey: sslKeyField?.value?.trim() || undefined
        };
    }

    function validateForm() {
        const data = getFormData();

        if (!data.name) {
            showError('Connection name is required');
            return false;
        }

        if (!data.host) {
            showError('Host is required');
            return false;
        }

        if (!data.port || data.port < 1 || data.port > 65535) {
            showError('Port must be between 1 and 65535');
            return false;
        }

        if (!data.username) {
            showError('Username is required');
            return false;
        }

        return true;
    }

    function testConnection() {
        if (!validateForm()) return;

        showInfo('Testing connection...');
        disableButtons(true);

        const config = getFormData();
        vscode.postMessage({
            type: 'testConnection',
            config: config
        });
    }

    function saveConnection() {
        if (!validateForm()) return;

        showInfo('Saving connection...');
        disableButtons(true);

        const config = getFormData();
        vscode.postMessage({
            type: 'saveConnection',
            config: config
        });
    }

    function cancel() {
        vscode.postMessage({ type: 'cancel' });
    }

    function browseFile(field) {
        vscode.postMessage({
            type: 'browseCertFile',
            field: field
        });
    }

    function handleCertFileSelected(field, path) {
        switch (field) {
            case 'sslCa':
                if (sslCaField) sslCaField.value = path;
                break;
            case 'sslCert':
                if (sslCertField) sslCertField.value = path;
                break;
            case 'sslKey':
                if (sslKeyField) sslKeyField.value = path;
                break;
        }
    }

    function handleTestResult(success, message) {
        disableButtons(false);

        if (success) {
            showSuccess(message);
        } else {
            showError(message);
        }
    }

    function checkProductionHost() {
        const host = hostField?.value?.trim()?.toLowerCase() || '';
        const isProduction =
            !host.includes('localhost') &&
            !host.includes('127.0.0.1') &&
            !host.includes('::1') &&
            !host.startsWith('192.168.') &&
            !host.startsWith('10.') &&
            !host.includes('dev') &&
            !host.includes('test') &&
            !host.includes('staging');

        if (productionWarning) {
            productionWarning.style.display = isProduction ? 'block' : 'none';
        }
    }

    function showInfo(message) {
        if (!statusMessage) return;
        statusMessage.className = 'status-message info';
        statusMessage.textContent = message;
        statusMessage.style.display = 'block';
    }

    function showSuccess(message) {
        if (!statusMessage) return;
        statusMessage.className = 'status-message success';
        statusMessage.textContent = '✓ ' + message;
        statusMessage.style.display = 'block';
    }

    function showError(message) {
        if (!statusMessage) return;
        statusMessage.className = 'status-message error';
        statusMessage.textContent = '✗ ' + message;
        statusMessage.style.display = 'block';
    }

    function hideStatus() {
        if (statusMessage) {
            statusMessage.style.display = 'none';
        }
    }

    function disableButtons(disabled) {
        if (testBtn) testBtn.disabled = disabled;
        if (saveBtn) saveBtn.disabled = disabled;
        if (cancelBtn) cancelBtn.disabled = disabled;
    }
})();
