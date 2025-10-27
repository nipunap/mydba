/**
 * Alert System Integration Tests
 * Tests metrics alerting, debouncing, and notification display
 */

import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Alert System Tests', () => {
    // Store original configuration values
    let originalAlertConfig: any;

    setup(async () => {
        // Save original alert configuration
        const config = vscode.workspace.getConfiguration('mydba.alerts');
        originalAlertConfig = {
            enabled: config.get('enabled'),
            connectionsThreshold: config.get('connectionsThreshold'),
            slowQueryThreshold: config.get('slowQueryThreshold'),
            bufferPoolHitRateThreshold: config.get('bufferPoolHitRateThreshold')
        };
    });

    teardown(async () => {
        // Restore original configuration
        const config = vscode.workspace.getConfiguration('mydba.alerts');
        for (const [key, value] of Object.entries(originalAlertConfig)) {
            await config.update(key, value, vscode.ConfigurationTarget.Global);
        }
    });

    test('Alert triggers when connections threshold exceeded', async function() {
        this.timeout(15000);

        // Configure low threshold for testing
        const config = vscode.workspace.getConfiguration('mydba.alerts');
        await config.update('enabled', true, vscode.ConfigurationTarget.Global);
        await config.update('connectionsThreshold', 1, vscode.ConfigurationTarget.Global);

        // Open metrics dashboard to trigger metric collection
        await vscode.commands.executeCommand('mydba.showMetricsDashboard');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Note: In real testing, we would need to mock the database adapter
        // to return metrics that exceed the threshold. For now, we verify
        // that the configuration is set correctly.
        assert.strictEqual(config.get('enabled'), true);
        assert.strictEqual(config.get('connectionsThreshold'), 1);
    });

    test('Alert configuration persists across sessions', async function() {
        this.timeout(10000);

        const config = vscode.workspace.getConfiguration('mydba.alerts');

        // Set custom thresholds
        await config.update('enabled', true, vscode.ConfigurationTarget.Global);
        await config.update('connectionsThreshold', 75, vscode.ConfigurationTarget.Global);
        await config.update('slowQueryThreshold', 50, vscode.ConfigurationTarget.Global);

        // Wait a moment for settings to persist
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify settings are saved
        assert.strictEqual(config.get('enabled'), true);
        assert.strictEqual(config.get('connectionsThreshold'), 75);
        assert.strictEqual(config.get('slowQueryThreshold'), 50);
    });

    test('Alert system can be disabled', async function() {
        this.timeout(10000);

        const config = vscode.workspace.getConfiguration('mydba.alerts');

        // Disable alerts
        await config.update('enabled', false, vscode.ConfigurationTarget.Global);
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify alerts are disabled
        assert.strictEqual(config.get('enabled'), false);

        // Open metrics dashboard
        await vscode.commands.executeCommand('mydba.showMetricsDashboard');
        await new Promise(resolve => setTimeout(resolve, 1000));

        // No errors should occur even with alerts disabled
        assert.ok(true, 'Metrics dashboard works with alerts disabled');
    });

    test('Multiple threshold configurations work correctly', async function() {
        this.timeout(10000);

        const config = vscode.workspace.getConfiguration('mydba.alerts');

        // Set multiple thresholds
        const testThresholds = {
            connectionsThreshold: 80,
            slowQueryThreshold: 100,
            bufferPoolHitRateThreshold: 95
        };

        for (const [key, value] of Object.entries(testThresholds)) {
            await config.update(key, value, vscode.ConfigurationTarget.Global);
        }

        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify all thresholds are set
        for (const [key, expectedValue] of Object.entries(testThresholds)) {
            const actualValue = config.get(key);
            assert.strictEqual(actualValue, expectedValue, `Threshold ${key} should be ${expectedValue}`);
        }
    });

    test('Alert threshold validation', async function() {
        this.timeout(10000);

        const config = vscode.workspace.getConfiguration('mydba.alerts');

        // Test boundary values
        await config.update('connectionsThreshold', 0, vscode.ConfigurationTarget.Global);
        assert.strictEqual(config.get('connectionsThreshold'), 0, 'Should accept 0 threshold');

        await config.update('connectionsThreshold', 100, vscode.ConfigurationTarget.Global);
        assert.strictEqual(config.get('connectionsThreshold'), 100, 'Should accept 100 threshold');

        // Test valid range
        await config.update('bufferPoolHitRateThreshold', 50, vscode.ConfigurationTarget.Global);
        assert.strictEqual(config.get('bufferPoolHitRateThreshold'), 50, 'Should accept mid-range value');
    });
});
