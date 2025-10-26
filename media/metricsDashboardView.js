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

    // DOM elements
    const loading = document.getElementById('loading');
    const error = document.getElementById('error');
    const errorMessage = document.getElementById('error-message');
    const metricsContainer = document.getElementById('metrics-container');
    const lastUpdated = document.getElementById('last-updated');
    const refreshBtn = document.getElementById('refresh-btn');
    const autoRefreshToggle = document.getElementById('auto-refresh-toggle');
    const timeRangeSelector = document.getElementById('time-range-selector');

    // Charts
    let connectionsChart, queriesChart, bufferPoolChart, threadsChart;
    let currentTimeRange = 3600000; // 1 hour default
    let metricsHistory = [];

    // Event listeners
    refreshBtn?.addEventListener('click', () => refresh());
    autoRefreshToggle?.addEventListener('change', (e) => {
        vscode.postMessage({
            type: 'toggleAutoRefresh',
            enabled: e.target.checked
        });
    });

    timeRangeSelector?.addEventListener('change', (e) => {
        currentTimeRange = parseInt(e.target.value);
        updateCharts();
    });

    // Listen for messages from extension
    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
            case 'metricsLoaded':
                metricsHistory = message.history || [];
                handleMetricsLoaded(message.metrics, message.timestamp);
                break;
            case 'metricsError':
                handleMetricsError(message.error);
                break;
        }
    });

    function refresh() {
        vscode.postMessage({ type: 'refresh' });
    }

    function handleMetricsLoaded(metrics, timestamp) {
        hideLoading();
        hideError();
        showMetrics();

        updateLastUpdated(timestamp);

        // Server info
        document.getElementById('server-version').textContent = metrics.version;
        document.getElementById('server-uptime').textContent = formatUptime(metrics.uptime);

        // Connections
        document.getElementById('connections-current').textContent = metrics.connections.current;
        document.getElementById('connections-max').textContent = `of ${metrics.connections.max} max`;
        document.getElementById('connections-running').textContent = metrics.connections.running;

        const connectionUsage = Math.round((metrics.connections.current / metrics.connections.max) * 100);
        document.getElementById('connections-usage').textContent = connectionUsage + '%';
        updateBar('connections-bar', connectionUsage);

        // Queries
        document.getElementById('queries-per-second').textContent = metrics.queries.perSecond.toFixed(2);
        document.getElementById('queries-slow').textContent = metrics.queries.slow;

        // Threads
        document.getElementById('threads-running').textContent = metrics.threads.running;
        document.getElementById('threads-connected').textContent = metrics.threads.connected;
        document.getElementById('threads-cached').textContent = metrics.threads.cached;

        // Buffer Pool
        if (metrics.bufferPool) {
            document.getElementById('buffer-pool-size').textContent = formatBytes(metrics.bufferPool.size);
            document.getElementById('buffer-pool-used').textContent = formatBytes(metrics.bufferPool.used);
            document.getElementById('buffer-pool-hit-rate').textContent = metrics.bufferPool.hitRate.toFixed(2) + '%';
            updateBar('buffer-pool-bar', metrics.bufferPool.hitRate);
        }

        // Table Cache
        if (metrics.tableCache) {
            document.getElementById('table-cache-hit-rate').textContent = metrics.tableCache.hitRate.toFixed(2) + '%';
            document.getElementById('table-cache-open').textContent = metrics.tableCache.open;
            document.getElementById('table-cache-opened-rate').textContent = metrics.tableCache.openedRate.toFixed(2);
            updateBar('table-cache-bar', metrics.tableCache.hitRate);
        }

        // Query Cache
        if (metrics.queryCache && metrics.queryCache.enabled) {
            const queryCacheSection = document.getElementById('query-cache-section');
            if (queryCacheSection) {
                queryCacheSection.style.display = 'block';
            }
            document.getElementById('query-cache-hit-rate').textContent = metrics.queryCache.hitRate.toFixed(2) + '%';
            document.getElementById('query-cache-size').textContent = formatBytes(metrics.queryCache.size);
            updateBar('query-cache-bar', metrics.queryCache.hitRate);
        }

        // Update charts
        updateCharts();
    }

    function updateCharts() {
        if (!metricsHistory || metricsHistory.length === 0) {
            return;
        }

        // Filter history by time range
        const now = Date.now();
        const cutoff = now - currentTimeRange;
        const filteredHistory = metricsHistory.filter(point => point.timestamp >= cutoff);

        if (filteredHistory.length === 0) {
            return;
        }

        // Prepare data - Format timestamps to short readable format
        const timestamps = filteredHistory.map(p => {
            const date = new Date(p.timestamp);
            return date.toLocaleTimeString('en-US', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit'
            });
        });

        // Connections chart
        const connectionsData = filteredHistory.map(p => p.metrics.connections.current);
        const connectionsMax = filteredHistory.map(p => p.metrics.connections.max);
        updateConnectionsChart(timestamps, connectionsData, connectionsMax);

        // Queries chart
        const queriesData = filteredHistory.map(p => p.metrics.queries.perSecond);
        const slowQueriesData = filteredHistory.map(p => p.metrics.queries.slow);
        updateQueriesChart(timestamps, queriesData, slowQueriesData);

        // Buffer Pool chart
        const bufferPoolData = filteredHistory.map(p => p.metrics.bufferPool?.hitRate || 0);
        updateBufferPoolChart(timestamps, bufferPoolData);

        // Threads chart
        const threadsRunning = filteredHistory.map(p => p.metrics.threads.running);
        const threadsConnected = filteredHistory.map(p => p.metrics.threads.connected);
        updateThreadsChart(timestamps, threadsRunning, threadsConnected);
    }

    function updateConnectionsChart(labels, current, max) {
        const ctx = document.getElementById('connections-chart');
        if (!ctx) return;

        // If chart exists, just update the data (much smoother!)
        if (connectionsChart) {
            connectionsChart.data.labels = labels;
            connectionsChart.data.datasets[0].data = current;
            connectionsChart.data.datasets[1].data = max;
            connectionsChart.update('none'); // 'none' = no animation for smooth updates
            return;
        }

        // Only create chart if it doesn't exist yet
        connectionsChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Current',
                        data: current,
                        borderColor: 'rgb(75, 255, 192)', // Brighter cyan
                        backgroundColor: 'rgba(75, 255, 192, 0.1)',
                        tension: 0.4,
                        fill: true,
                        borderWidth: 2,
                        pointRadius: 0, // Hide points by default
                        pointHoverRadius: 5, // Show on hover
                        pointHoverBackgroundColor: 'rgb(75, 255, 192)',
                        pointHoverBorderColor: '#fff',
                        pointHoverBorderWidth: 2
                    },
                    {
                        label: 'Max',
                        data: max,
                        borderColor: 'rgba(255, 99, 132, 0.7)', // Brighter red
                        borderDash: [5, 5],
                        tension: 0,
                        fill: false,
                        borderWidth: 2,
                        pointRadius: 0, // Hide points by default
                        pointHoverRadius: 5, // Show on hover
                        pointHoverBackgroundColor: 'rgb(255, 99, 132)',
                        pointHoverBorderColor: '#fff',
                        pointHoverBorderWidth: 2
                    }
                ]
            },
            options: getChartOptions('Connections')
        });
    }

    function updateQueriesChart(labels, queriesPerSec, slowQueries) {
        const ctx = document.getElementById('queries-chart');
        if (!ctx) return;

        // If chart exists, just update the data (much smoother!)
        if (queriesChart) {
            queriesChart.data.labels = labels;
            queriesChart.data.datasets[0].data = queriesPerSec;
            queriesChart.data.datasets[1].data = slowQueries;
            queriesChart.update('none'); // 'none' = no animation for smooth updates
            return;
        }

        // Only create chart if it doesn't exist yet
        queriesChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Queries/sec',
                        data: queriesPerSec,
                        borderColor: 'rgb(54, 162, 255)', // Brighter blue
                        backgroundColor: 'rgba(54, 162, 255, 0.1)',
                        tension: 0.4,
                        fill: true,
                        yAxisID: 'y',
                        borderWidth: 2,
                        pointRadius: 0, // Hide points by default
                        pointHoverRadius: 5, // Show on hover
                        pointHoverBackgroundColor: 'rgb(54, 162, 255)',
                        pointHoverBorderColor: '#fff',
                        pointHoverBorderWidth: 2
                    },
                    {
                        label: 'Slow Queries',
                        data: slowQueries,
                        borderColor: 'rgb(255, 206, 86)', // Brighter yellow/orange
                        backgroundColor: 'rgba(255, 206, 86, 0.1)',
                        tension: 0.4,
                        fill: true,
                        yAxisID: 'y1',
                        borderWidth: 2,
                        pointRadius: 0, // Hide points by default
                        pointHoverRadius: 5, // Show on hover
                        pointHoverBackgroundColor: 'rgb(255, 206, 86)',
                        pointHoverBorderColor: '#fff',
                        pointHoverBorderWidth: 2
                    }
                ]
            },
            options: getDualAxisChartOptions('Queries', 'Queries/sec', 'Slow Queries')
        });
    }

    function updateBufferPoolChart(labels, hitRate) {
        const ctx = document.getElementById('buffer-pool-chart');
        if (!ctx) return;

        // If chart exists, just update the data (much smoother!)
        if (bufferPoolChart) {
            bufferPoolChart.data.labels = labels;
            bufferPoolChart.data.datasets[0].data = hitRate;
            bufferPoolChart.update('none'); // 'none' = no animation for smooth updates
            return;
        }

        // Only create chart if it doesn't exist yet
        bufferPoolChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Hit Rate %',
                    data: hitRate,
                    borderColor: 'rgb(201, 153, 255)', // Brighter purple
                    backgroundColor: 'rgba(201, 153, 255, 0.1)',
                    tension: 0.4,
                    fill: true,
                    borderWidth: 2,
                    pointRadius: 0, // Hide points by default
                    pointHoverRadius: 5, // Show on hover
                    pointHoverBackgroundColor: 'rgb(201, 153, 255)',
                    pointHoverBorderColor: '#fff',
                    pointHoverBorderWidth: 2
                }]
            },
            options: {
                ...getChartOptions('Hit Rate %'),
                scales: {
                    ...getChartOptions('Hit Rate %').scales,
                    y: {
                        ...getChartOptions('Hit Rate %').scales.y,
                        min: 0,
                        max: 100
                    }
                },
                plugins: {
                    ...getChartOptions('Hit Rate %').plugins,
                    annotation: {
                        annotations: {
                            warningLine: {
                                type: 'line',
                                yMin: 90,
                                yMax: 90,
                                borderColor: 'rgb(255, 205, 86)',
                                borderWidth: 2,
                                borderDash: [10, 5],
                                label: {
                                    content: 'Warning Threshold (90%)',
                                    enabled: true,
                                    position: 'end'
                                }
                            }
                        }
                    }
                }
            }
        });
    }

    function updateThreadsChart(labels, running, connected) {
        const ctx = document.getElementById('threads-chart');
        if (!ctx) return;

        // If chart exists, just update the data (much smoother!)
        if (threadsChart) {
            threadsChart.data.labels = labels;
            threadsChart.data.datasets[0].data = running;
            threadsChart.data.datasets[1].data = connected;
            threadsChart.update('none'); // 'none' = no animation for smooth updates
            return;
        }

        // Only create chart if it doesn't exist yet
        threadsChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Running',
                        data: running,
                        borderColor: 'rgb(255, 99, 132)', // Brighter red
                        backgroundColor: 'rgba(255, 99, 132, 0.1)',
                        tension: 0.4,
                        fill: true,
                        borderWidth: 2,
                        pointRadius: 0, // Hide points by default
                        pointHoverRadius: 5, // Show on hover
                        pointHoverBackgroundColor: 'rgb(255, 99, 132)',
                        pointHoverBorderColor: '#fff',
                        pointHoverBorderWidth: 2
                    },
                    {
                        label: 'Connected',
                        data: connected,
                        borderColor: 'rgb(75, 255, 192)', // Brighter cyan (matching connections)
                        backgroundColor: 'rgba(75, 255, 192, 0.1)',
                        tension: 0.4,
                        fill: true,
                        borderWidth: 2,
                        pointRadius: 0, // Hide points by default
                        pointHoverRadius: 5, // Show on hover
                        pointHoverBackgroundColor: 'rgb(75, 255, 192)',
                        pointHoverBorderColor: '#fff',
                        pointHoverBorderWidth: 2
                    }
                ]
            },
            options: getChartOptions('Threads')
        });
    }

    function getChartOptions(title) {
        return {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: '#cccccc', // Lighter color for better visibility
                        usePointStyle: true,
                        padding: 15,
                        font: {
                            size: 13,
                            weight: 'bold'
                        }
                    }
                },
                title: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    borderColor: '#555555',
                    borderWidth: 1,
                    padding: 12,
                    titleFont: {
                        size: 14,
                        weight: 'bold'
                    },
                    bodyFont: {
                        size: 13
                    }
                }
            },
            scales: {
                x: {
                    type: 'category', // Changed from 'time' - we use simple string labels
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)', // Lighter grid lines
                        drawBorder: true,
                        borderColor: '#555555'
                    },
                    ticks: {
                        color: '#cccccc', // Lighter tick labels
                        maxRotation: 0, // Keep labels horizontal
                        minRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 8, // Reduce number of labels
                        font: {
                            size: 11
                        }
                    },
                    title: {
                        display: true,
                        text: 'Time',
                        color: '#cccccc',
                        font: {
                            size: 12,
                            weight: 'bold'
                        }
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)', // Lighter grid lines
                        drawBorder: true,
                        borderColor: '#555555'
                    },
                    ticks: {
                        color: '#cccccc', // Lighter tick labels
                        font: {
                            size: 11
                        }
                    },
                    title: {
                        display: true,
                        text: title,
                        color: '#cccccc',
                        font: {
                            size: 12,
                            weight: 'bold'
                        }
                    }
                }
            }
        };
    }

    function getDualAxisChartOptions(title, leftLabel, rightLabel) {
        const options = getChartOptions(title);
        options.scales.y.title.text = leftLabel; // Update left axis label
        options.scales.y1 = {
            type: 'linear',
            position: 'right',
            beginAtZero: true,
            grid: {
                drawOnChartArea: false, // Don't overlap with left grid
                color: 'rgba(255, 255, 255, 0.1)',
                borderColor: '#555555'
            },
            ticks: {
                color: '#cccccc',
                font: {
                    size: 11
                }
            },
            title: {
                display: true,
                text: rightLabel,
                color: '#cccccc',
                font: {
                    size: 12,
                    weight: 'bold'
                }
            }
        };
        return options;
    }

    function handleMetricsError(err) {
        hideLoading();
        showError(err);
        hideMetrics();
    }

    function updateBar(barId, percentage) {
        const bar = document.getElementById(barId);
        if (!bar) return;

        bar.style.width = percentage + '%';

        // Color code based on value
        if (percentage >= 90) {
            bar.style.backgroundColor = '#90ee90'; // Green
        } else if (percentage >= 70) {
            bar.style.backgroundColor = '#ffa500'; // Orange
        } else {
            bar.style.backgroundColor = '#ff4500'; // Red
        }
    }

    function updateLastUpdated(timestamp) {
        if (lastUpdated) {
            lastUpdated.textContent = `Last updated: ${new Date(timestamp).toLocaleTimeString()}`;
        }
    }

    function formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        if (days > 0) {
            return `${days}d ${hours}h ${minutes}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    }

    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    }

    function showLoading() {
        if (loading) loading.style.display = 'flex';
    }

    function hideLoading() {
        if (loading) loading.style.display = 'none';
    }

    function showError(message) {
        if (error) error.style.display = 'flex';
        if (errorMessage) errorMessage.textContent = message;
    }

    function hideError() {
        if (error) error.style.display = 'none';
    }

    function showMetrics() {
        if (metricsContainer) metricsContainer.style.display = 'block';
    }

    function hideMetrics() {
        if (metricsContainer) metricsContainer.style.display = 'none';
    }
})();
