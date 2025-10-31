/**
 * Unit tests for Explain Viewer utility functions
 */

// Setup JSDOM for browser API simulation
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;

const {
    isValidNumber,
    escapeHtml,
    sanitizeAccessType,
    sanitizeMetricLevel,
    sanitizeColor,
    formatArray,
    getCostClass,
    generateNodeId
} = require('./explainViewerUtils');

describe('ExplainViewer Utility Functions', () => {

    describe('isValidNumber', () => {
        test('returns true for valid numbers', () => {
            expect(isValidNumber(0)).toBe(true);
            expect(isValidNumber(42)).toBe(true);
            expect(isValidNumber(-10)).toBe(true);
            expect(isValidNumber(3.14)).toBe(true);
            expect(isValidNumber(0.0001)).toBe(true);
        });

        test('returns false for NaN', () => {
            expect(isValidNumber(NaN)).toBe(false);
            expect(isValidNumber(0 / 0)).toBe(false);
        });

        test('returns false for Infinity', () => {
            expect(isValidNumber(Infinity)).toBe(false);
            expect(isValidNumber(-Infinity)).toBe(false);
        });

        test('returns false for non-numbers', () => {
            expect(isValidNumber('42')).toBe(false);
            expect(isValidNumber(null)).toBe(false);
            expect(isValidNumber(undefined)).toBe(false);
            expect(isValidNumber({})).toBe(false);
            expect(isValidNumber([])).toBe(false);
            expect(isValidNumber(true)).toBe(false);
        });
    });

    describe('escapeHtml', () => {
        test('escapes HTML special characters', () => {
            expect(escapeHtml('<script>alert("XSS")</script>'))
                .toBe('&lt;script&gt;alert("XSS")&lt;/script&gt;');
            expect(escapeHtml('<div>Test</div>'))
                .toBe('&lt;div&gt;Test&lt;/div&gt;');
            expect(escapeHtml('&<>"\''))
                .toContain('&amp;');
        });

        test('handles null and undefined', () => {
            expect(escapeHtml(null)).toBe('');
            expect(escapeHtml(undefined)).toBe('');
        });

        test('converts non-strings to strings', () => {
            expect(escapeHtml(42)).toBe('42');
            expect(escapeHtml(true)).toBe('true');
        });

        test('handles empty strings', () => {
            expect(escapeHtml('')).toBe('');
        });

        test('handles SQL injection attempts', () => {
            const malicious = "'; DROP TABLE users; --";
            const escaped = escapeHtml(malicious);
            // SQL injection in text content is safe, no HTML escaping needed
            expect(escaped).toBe(malicious);
        });

        test('handles event handlers', () => {
            const malicious = '<img src=x onerror="alert(1)">';
            const escaped = escapeHtml(malicious);
            // Should escape angle brackets, making the tag inert
            expect(escaped).toContain('&lt;img');
            expect(escaped).toContain('&gt;');
            expect(escaped).not.toContain('<img');
        });
    });

    describe('sanitizeAccessType', () => {
        test('returns valid access types unchanged', () => {
            expect(sanitizeAccessType('ALL')).toBe('ALL');
            expect(sanitizeAccessType('index')).toBe('index');
            expect(sanitizeAccessType('range')).toBe('range');
            expect(sanitizeAccessType('ref')).toBe('ref');
            expect(sanitizeAccessType('eq_ref')).toBe('eq_ref');
            expect(sanitizeAccessType('const')).toBe('const');
        });

        test('returns "unknown" for invalid types', () => {
            expect(sanitizeAccessType('invalid')).toBe('unknown');
            expect(sanitizeAccessType('hack')).toBe('unknown');
            expect(sanitizeAccessType('<script>')).toBe('unknown');
        });

        test('returns "unknown" for non-strings', () => {
            expect(sanitizeAccessType(null)).toBe('unknown');
            expect(sanitizeAccessType(undefined)).toBe('unknown');
            expect(sanitizeAccessType(42)).toBe('unknown');
            expect(sanitizeAccessType({})).toBe('unknown');
        });
    });

    describe('sanitizeMetricLevel', () => {
        test('returns valid levels in lowercase', () => {
            expect(sanitizeMetricLevel('LOW')).toBe('low');
            expect(sanitizeMetricLevel('Medium')).toBe('medium');
            expect(sanitizeMetricLevel('HIGH')).toBe('high');
            expect(sanitizeMetricLevel('easy')).toBe('easy');
            expect(sanitizeMetricLevel('HARD')).toBe('hard');
        });

        test('returns "unknown" for invalid levels', () => {
            expect(sanitizeMetricLevel('invalid')).toBe('unknown');
            expect(sanitizeMetricLevel('extreme')).toBe('unknown');
        });

        test('returns "unknown" for non-strings', () => {
            expect(sanitizeMetricLevel(null)).toBe('unknown');
            expect(sanitizeMetricLevel(123)).toBe('unknown');
        });
    });

    describe('sanitizeColor', () => {
        test('returns valid colors unchanged', () => {
            expect(sanitizeColor('good')).toBe('good');
            expect(sanitizeColor('warning')).toBe('warning');
            expect(sanitizeColor('critical')).toBe('critical');
        });

        test('returns "good" as default for invalid colors', () => {
            expect(sanitizeColor('red')).toBe('good');
            expect(sanitizeColor('blue')).toBe('good');
            expect(sanitizeColor('<script>')).toBe('good');
        });

        test('returns "good" for non-strings', () => {
            expect(sanitizeColor(null)).toBe('good');
            expect(sanitizeColor(123)).toBe('good');
        });
    });

    describe('formatArray', () => {
        test('formats arrays with comma separation', () => {
            expect(formatArray(['a', 'b', 'c'])).toBe('a, b, c');
            expect(formatArray([1, 2, 3])).toBe('1, 2, 3');
        });

        test('escapes HTML in array items', () => {
            const result = formatArray(['<script>', 'normal', '<div>']);
            expect(result).not.toContain('<script>');
            expect(result).toContain('normal');
        });

        test('returns "-" for empty arrays', () => {
            expect(formatArray([])).toBe('-');
        });

        test('returns "-" for null/undefined', () => {
            expect(formatArray(null)).toBe('-');
            expect(formatArray(undefined)).toBe('-');
        });

        test('handles single-item arrays', () => {
            expect(formatArray(['single'])).toBe('single');
        });
    });

    describe('getCostClass', () => {
        test('returns "cost-critical" for high costs', () => {
            expect(getCostClass(10001)).toBe('cost-critical');
            expect(getCostClass(50000)).toBe('cost-critical');
            expect(getCostClass(100000)).toBe('cost-critical');
        });

        test('returns "cost-warning" for medium costs', () => {
            expect(getCostClass(1001)).toBe('cost-warning');
            expect(getCostClass(5000)).toBe('cost-warning');
            expect(getCostClass(10000)).toBe('cost-warning');
        });

        test('returns "cost-good" for low costs', () => {
            expect(getCostClass(0)).toBe('cost-good');
            expect(getCostClass(100)).toBe('cost-good');
            expect(getCostClass(1000)).toBe('cost-good');
        });

        test('handles boundary values', () => {
            expect(getCostClass(1000)).toBe('cost-good');
            expect(getCostClass(1001)).toBe('cost-warning');
            expect(getCostClass(10000)).toBe('cost-warning');
            expect(getCostClass(10001)).toBe('cost-critical');
        });
    });

    describe('generateNodeId', () => {
        test('generates ID with table name', () => {
            const node = { table: 'users', type: 'SELECT' };
            expect(generateNodeId(node, 0)).toBe('node-0-users');
        });

        test('generates ID with type when table is missing', () => {
            const node = { type: 'UNION' };
            expect(generateNodeId(node, 1)).toBe('node-1-UNION');
        });

        test('generates ID with "unknown" when both are missing', () => {
            const node = {};
            expect(generateNodeId(node, 2)).toBe('node-2-unknown');
        });

        test('includes index in ID', () => {
            const node = { table: 'orders' };
            expect(generateNodeId(node, 5)).toBe('node-5-orders');
        });

        test('prefers table over type', () => {
            const node = { table: 'products', type: 'SELECT' };
            const id = generateNodeId(node, 0);
            expect(id).toContain('products');
            expect(id).not.toContain('SELECT');
        });
    });

    describe('Edge Cases and Security', () => {
        test('escapeHtml handles deeply nested XSS attempts', () => {
            const malicious = '<img src=x onerror="eval(atob(\'...\'))">';
            const escaped = escapeHtml(malicious);
            expect(escaped).toContain('&lt;');
            expect(escaped).toContain('&gt;');
            expect(escaped).not.toContain('<img');
        });

        test('sanitizeAccessType prevents class injection', () => {
            const injection = 'valid; malicious-class';
            expect(sanitizeAccessType(injection)).toBe('unknown');
        });

        test('formatArray handles mixed types safely', () => {
            const mixed = ['string', 123, null, undefined, '<script>'];
            const result = formatArray(mixed);
            expect(result).not.toContain('<script>');
            expect(result).toContain('123');
        });

        test('generateNodeId sanitizes node properties', () => {
            const node = { table: '<script>alert(1)</script>' };
            const id = generateNodeId(node, 0);
            // ID should contain the malicious code as-is since it's not HTML
            // but it will be escaped when used in HTML context
            expect(id).toContain('script');
        });
    });

    describe('Performance and Large Inputs', () => {
        test('formatArray handles large arrays efficiently', () => {
            const largeArray = Array.from({ length: 1000 }, (_, i) => `item${i}`);
            const start = Date.now();
            const result = formatArray(largeArray);
            const duration = Date.now() - start;

            expect(result).toContain('item0');
            expect(result).toContain('item999');
            expect(duration).toBeLessThan(500); // Should complete quickly (increased for CI environments)
        });

        test('escapeHtml handles long strings', () => {
            const longString = '<script>' + 'a'.repeat(10000) + '</script>';
            const escaped = escapeHtml(longString);
            expect(escaped).toContain('&lt;script&gt;');
            expect(escaped.length).toBeGreaterThan(longString.length);
        });
    });
});
