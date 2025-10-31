/**
 * Utility functions for the Explain Viewer
 * These are extracted for testing purposes
 */

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
    if (typeof str !== 'string') return 'good';
    const allowedColors = ['good', 'warning', 'critical'];
    return allowedColors.includes(str) ? str : 'good';
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
    const COST_THRESHOLDS = { CRITICAL: 10000, WARNING: 1000 };
    if (cost > COST_THRESHOLDS.CRITICAL) return 'cost-critical';
    if (cost > COST_THRESHOLDS.WARNING) return 'cost-warning';
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

// Export for testing (Node.js environment)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        isValidNumber,
        escapeHtml,
        sanitizeAccessType,
        sanitizeMetricLevel,
        sanitizeColor,
        formatArray,
        getCostClass,
        generateNodeId
    };
}
