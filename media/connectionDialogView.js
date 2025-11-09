// @ts-check
(function () {
    // @ts-ignore
    const vscode = acquireVsCodeApi();

    // Wait for web components to be defined before accessing DOM
    async function initializeForm() {
        // Wait for all required web components to be defined
        await Promise.all([
            customElements.whenDefined('vscode-text-field'),
            customElements.whenDefined('vscode-dropdown'),
            customElements.whenDefined('vscode-button'),
            customElements.whenDefined('vscode-checkbox')
        ]);

        // DOM elements
        const form = document.getElementById('connection-form');
        const nameField = document.getElementById('connection-name');
        const typeField = document.getElementById('connection-type');
        const environmentDropdown = document.getElementById('environment');
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

        // SSH elements
        const sshSection = document.getElementById('ssh-section');
        const sshEnabledCheckbox = document.getElementById('ssh-enabled');
        const sshOptions = document.getElementById('ssh-options');
        const sshHostField = document.getElementById('ssh-host');
        const sshPortField = document.getElementById('ssh-port');
        const sshUserField = document.getElementById('ssh-user');
        const sshKeyPathField = document.getElementById('ssh-key-path');
        const sshPassphraseField = document.getElementById('ssh-passphrase');
        const browseSSHKeyBtn = document.getElementById('browse-ssh-key');

        // AWS elements
        const awsDiscoverySection = document.getElementById('aws-discovery-section');
        const awsIamSection = document.getElementById('aws-iam-section');
        const awsProfileField = document.getElementById('aws-profile');
        const awsIamEnabledCheckbox = document.getElementById('aws-iam-enabled');
        const awsIamOptions = document.getElementById('aws-iam-options');
        const awsIamRoleArnField = document.getElementById('aws-iam-role-arn');
        const awsRegionDropdown = document.getElementById('aws-region');
        const discoverRDSBtn = document.getElementById('discover-rds-btn');
        const rdsInstanceDropdown = document.getElementById('rds-instance');
        const rdsInstanceGroup = document.getElementById('rds-instance-group');

        const testBtn = document.getElementById('test-btn');
        const cancelBtn = document.getElementById('cancel-btn');
        const saveBtn = document.getElementById('save-btn');
        const statusMessage = document.getElementById('status-message');
        const productionWarning = document.getElementById('production-warning');

        // State
        let sshPrivateKey = '';
        let rdsInstances = [];

        // Event listeners
        typeField?.addEventListener('change', handleDatabaseTypeChange);

        sslEnabledCheckbox?.addEventListener('change', (e) => {
            if (sslOptions) {
                sslOptions.style.display = e.target.checked ? 'block' : 'none';
            }
        });

        sshEnabledCheckbox?.addEventListener('change', (e) => {
            if (sshOptions) {
                sshOptions.style.display = e.target.checked ? 'block' : 'none';
            }
        });

        awsIamEnabledCheckbox?.addEventListener('change', (e) => {
            if (awsIamOptions) {
                awsIamOptions.style.display = e.target.checked ? 'block' : 'none';
            }
        });

        hostField?.addEventListener('input', checkProductionHost);

        browseCaBtn?.addEventListener('click', () => browseFile('sslCa'));
        browseCertBtn?.addEventListener('click', () => browseFile('sslCert'));
        browseKeyBtn?.addEventListener('click', () => browseFile('sslKey'));
        browseSSHKeyBtn?.addEventListener('click', browseSSHKey);

        discoverRDSBtn?.addEventListener('click', discoverRDSInstances);
        rdsInstanceDropdown?.addEventListener('change', handleRDSInstanceSelect);

        testBtn?.addEventListener('click', testConnection);
        cancelBtn?.addEventListener('click', cancel);
        saveBtn?.addEventListener('click', saveConnection);

        // Initialize database type
        handleDatabaseTypeChange();

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
                case 'sshKeySelected':
                    handleSSHKeySelected(message.path, message.content);
                    break;
                case 'rdsInstancesDiscovered':
                    handleRDSInstancesDiscovered(message.instances);
                    break;
                case 'rdsDiscoveryStatus':
                    handleRDSDiscoveryStatus(message.status, message.message);
                    break;
            }
        });

        function handleDatabaseTypeChange() {
            const type = typeField?.value || 'mysql';
            const isRDS = type === 'aws-rds-mysql' || type === 'aws-rds-mariadb';

            // Show SSH for non-RDS types only
            if (sshSection) {
                sshSection.style.display = isRDS ? 'none' : 'block';
            }

            // Show AWS discovery section only for RDS types
            if (awsDiscoverySection) {
                awsDiscoverySection.style.display = isRDS ? 'block' : 'none';
            }

            // Show AWS IAM section only for RDS types
            if (awsIamSection) {
                awsIamSection.style.display = isRDS ? 'block' : 'none';
            }
        }

        function browseSSHKey() {
            vscode.postMessage({
                type: 'browseSSHKey'
            });
        }

        function handleSSHKeySelected(path, content) {
            if (sshKeyPathField) {
                sshKeyPathField.value = path;
                sshPrivateKey = content;
            }
        }

        function discoverRDSInstances() {
            const region = awsRegionDropdown?.value;
            if (!region) {
                showError('Please select an AWS region first');
                return;
            }

            const profile = awsProfileField?.value?.trim() || undefined;

            // Set loading state
            if (discoverRDSBtn) {
                discoverRDSBtn.disabled = true;
                discoverRDSBtn.textContent = 'Discovering...';
            }

            vscode.postMessage({
                type: 'discoverRDSInstances',
                region: region,
                profile: profile
            });
        }

        function handleRDSInstancesDiscovered(instances) {
            rdsInstances = instances;

            // Clear loading state
            if (discoverRDSBtn) {
                discoverRDSBtn.disabled = false;
                discoverRDSBtn.textContent = 'Discover RDS Instances';
            }

            // Clear existing options
            if (rdsInstanceDropdown) {
                rdsInstanceDropdown.innerHTML = '<vscode-option value="">Select instance...</vscode-option>';

                instances.forEach(instance => {
                    const option = document.createElement('vscode-option');
                    option.value = instance.identifier;
                    option.textContent = `${instance.identifier} (${instance.engine} ${instance.engineVersion})`;
                    rdsInstanceDropdown.appendChild(option);
                });

                if (rdsInstanceGroup) {
                    rdsInstanceGroup.style.display = 'block';
                }
            }
        }

        function handleRDSInstanceSelect() {
            const selectedId = rdsInstanceDropdown?.value;
            if (!selectedId) return;

            const instance = rdsInstances.find(i => i.identifier === selectedId);
            if (!instance) return;

            // Auto-fill host and port
            if (hostField) hostField.value = instance.endpoint;
            if (portField) portField.value = instance.port;

            showInfo(`Selected: ${instance.engine} ${instance.engineVersion} - ${instance.status}`);
        }

        function handleRDSDiscoveryStatus(status, message) {
            // Clear loading state
            if (discoverRDSBtn) {
                discoverRDSBtn.disabled = false;
                discoverRDSBtn.textContent = 'Discover RDS Instances';
            }
            if (status === 'error') {
                showError(message);
            } else if (status === 'success') {
                showSuccess(message);
            } else {
                showInfo(message);
            }
        }

        function loadConnectionData(config) {
            if (nameField) nameField.value = config.name || '';
            if (typeField) typeField.value = config.type || 'mysql';
            if (environmentDropdown) environmentDropdown.value = config.environment || 'dev';
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

            // SSH settings
            if (config.ssh) {
                if (sshEnabledCheckbox) sshEnabledCheckbox.checked = true;
                if (sshOptions) sshOptions.style.display = 'block';

                if (sshHostField && config.ssh.host) sshHostField.value = config.ssh.host;
                if (sshPortField && config.ssh.port) sshPortField.value = config.ssh.port;
                if (sshUserField && config.ssh.user) sshUserField.value = config.ssh.user;
                if (sshKeyPathField && config.ssh.keyPath) sshKeyPathField.value = config.ssh.keyPath;
                // Note: privateKey is stored securely and not loaded back into the form
            }

            // AWS IAM settings
            if (config.awsIamAuth) {
                if (awsIamEnabledCheckbox) awsIamEnabledCheckbox.checked = true;
                if (awsIamOptions) awsIamOptions.style.display = 'block';

                if (awsIamRoleArnField && config.awsIamAuth.assumeRole) {
                    awsIamRoleArnField.value = config.awsIamAuth.assumeRole;
                }

                // Also populate discovery fields if this is an AWS RDS type
                if (awsProfileField && config.awsIamAuth.profile) {
                    awsProfileField.value = config.awsIamAuth.profile;
                }
                if (awsRegionDropdown && config.awsIamAuth.region) {
                    awsRegionDropdown.value = config.awsIamAuth.region;
                }
            }

            checkProductionHost();
        }

        function getFormData() {
            return {
                name: nameField?.value?.trim() || '',
                type: typeField?.value || 'mysql',
                environment: environmentDropdown?.value || 'dev',
                host: hostField?.value?.trim() || '127.0.0.1',
                port: parseInt(portField?.value) || 3306,
                username: usernameField?.value?.trim() || 'root',
                password: passwordField?.value || '',
                database: databaseField?.value?.trim() || undefined,
                sslEnabled: sslEnabledCheckbox?.checked || false,
                sslVerify: sslVerifyCheckbox?.checked || false,
                sslCa: sslCaField?.value?.trim() || undefined,
                sslCert: sslCertField?.value?.trim() || undefined,
                sslKey: sslKeyField?.value?.trim() || undefined,
                sshEnabled: sshEnabledCheckbox?.checked || false,
                sshHost: sshHostField?.value?.trim() || undefined,
                sshPort: parseInt(sshPortField?.value) || 22,
                sshUser: sshUserField?.value?.trim() || undefined,
                sshKeyPath: sshKeyPathField?.value?.trim() || undefined,
                sshPrivateKey: sshPrivateKey || undefined,
                sshPassphrase: sshPassphraseField?.value || undefined,
                awsIamEnabled: awsIamEnabledCheckbox?.checked || false,
                awsProfile: awsProfileField?.value?.trim() || undefined,
                awsRegion: awsRegionDropdown?.value || undefined,
                awsRoleArn: awsIamRoleArnField?.value?.trim() || undefined
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
    }

    // Initialize the form once DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeForm);
    } else {
        initializeForm();
    }
})();
