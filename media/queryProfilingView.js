// @ts-check
(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  const loading = document.getElementById('loading');
  const errorBox = document.getElementById('error');
  const errorMessage = document.getElementById('error-message');
  const content = document.getElementById('content');
  const stagesBody = document.getElementById('stages-body');
  const totalDuration = document.getElementById('total-duration');
  const rowsExamined = document.getElementById('rows-examined');
  const rowsSent = document.getElementById('rows-sent');
  const efficiency = document.getElementById('efficiency');
  const queryText = document.getElementById('query-text');
  const reprofileBtn = document.getElementById('reprofile-btn');

  // Waterfall chart elements
  const waterfallCanvas = document.getElementById('waterfall-chart');
  const waterfallChartContainer = document.getElementById('waterfall-chart-container');
  const stagesTableContainer = document.getElementById('stages-table-container');
  const toggleViewBtn = document.getElementById('toggle-view-btn');
  const exportChartBtn = document.getElementById('export-chart-btn');

  // AI insights elements
  const aiInsightsLoading = document.getElementById('ai-insights-loading');
  const aiInsightsError = document.getElementById('ai-insights-error');
  const aiInsightsErrorMessage = document.getElementById('ai-insights-error-message');
  const aiInsightsContent = document.getElementById('ai-insights-content');

  // State
  let chartInstance = null;
  let currentView = 'chart'; // 'chart' or 'table'
  let currentProfile = null;

  window.addEventListener('error', (e) => showError(e.error?.message || e.message || 'Unknown error'), { once: true });
  reprofileBtn?.addEventListener('click', () => vscode.postMessage({ type: 'reprofile' }));
  toggleViewBtn?.addEventListener('click', toggleView);
  exportChartBtn?.addEventListener('click', exportChart);

  window.addEventListener('message', (event) => {
    const message = event.data;
    switch (message.type) {
      case 'profileLoaded':
        render(message.profile, message.query);
        break;
      case 'error':
        showError(message.message);
        break;
      case 'aiInsightsLoading':
        showAIInsightsLoading();
        break;
      case 'aiInsights':
        showAIInsights(message.insights);
        break;
      case 'aiInsightsError':
        showAIInsightsError(message.error);
        break;
    }
  });

  function render(profile, query) {
    hideLoading(); hideError(); content.style.display = 'block';
    currentProfile = profile;

    totalDuration.textContent = `${Number(profile.totalDuration || 0).toFixed(2)} µs`;
    rowsExamined.textContent = `${Number(profile.summary.totalRowsExamined || 0)}`;
    rowsSent.textContent = `${Number(profile.summary.totalRowsSent || 0)}`;
    efficiency.textContent = `${Number(profile.summary.efficiency || 0).toFixed(2)}%`;
    queryText.textContent = query;

    // Render waterfall chart
    if (waterfallCanvas && typeof Chart !== 'undefined') {
      renderWaterfallChart(profile);
    }

    // Render table (for toggle view)
    renderStagesTable(profile);
  }

  function renderWaterfallChart(profile) {
    if (!profile || !profile.stages || profile.stages.length === 0) {
      return;
    }

    // Destroy existing chart
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }

    // Transform stages into waterfall format
    const stages = profile.stages || [];
    const totalDuration = profile.totalDuration || 0;

    // Calculate cumulative start times
    let cumulativeTime = 0;
    const waterfallData = stages.map((stage, idx) => {
      const startTime = cumulativeTime;
      const duration = Number(stage.duration || 0);
      const endTime = startTime + duration;
      cumulativeTime = endTime;

      const percentage = totalDuration > 0 ? (duration / totalDuration) * 100 : 0;
      const color = getStageColor(percentage, stage.eventName);

      return {
        label: stage.eventName || `Stage ${idx + 1}`,
        start: startTime,
        duration: duration,
        end: endTime,
        percentage: percentage,
        color: color
      };
    });

    // Sort by duration (descending) for better visualization
    waterfallData.sort((a, b) => b.duration - a.duration);

    const ctx = waterfallCanvas.getContext('2d');

    chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: waterfallData.map(d => d.label),
        datasets: [{
          label: 'Duration (µs)',
          data: waterfallData.map(d => d.duration),
          backgroundColor: waterfallData.map(d => d.color),
          borderColor: waterfallData.map(d => d.color.replace('0.7', '1')),
          borderWidth: 1
        }]
      },
      options: {
        indexAxis: 'y', // Horizontal bars
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: false
          },
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              title: (context) => {
                return waterfallData[context[0].dataIndex].label;
              },
              label: (context) => {
                const data = waterfallData[context.dataIndex];
                return [
                  `Duration: ${data.duration.toFixed(2)} µs`,
                  `Percentage: ${data.percentage.toFixed(1)}%`,
                  `Start: ${data.start.toFixed(2)} µs`,
                  `End: ${data.end.toFixed(2)} µs`
                ];
              }
            },
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleColor: '#fff',
            bodyColor: '#fff',
            borderColor: '#666',
            borderWidth: 1,
            padding: 12,
            displayColors: true
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'Duration (µs)',
              color: 'var(--vscode-foreground)',
              font: {
                size: 13,
                weight: 'bold'
              }
            },
            ticks: {
              color: 'var(--vscode-foreground)',
              font: {
                size: 12,
                weight: '500'
              }
            },
            grid: {
              color: 'var(--vscode-widget-border)'
            }
          },
          y: {
            ticks: {
              color: 'var(--vscode-foreground)',
              font: {
                size: 12,
                weight: '500'
              },
              autoSkip: false,
              padding: 5
            },
            grid: {
              display: false
            }
          }
        }
      }
    });
  }

  function getStageColor(percentage, eventName) {
    // Color based on performance impact
    if (percentage > 50) {
      return 'rgba(255, 99, 132, 0.7)'; // Red - critical
    } else if (percentage > 20) {
      return 'rgba(255, 206, 86, 0.7)'; // Yellow - warning
    } else if (percentage > 5) {
      return 'rgba(54, 162, 235, 0.7)'; // Blue - moderate
    } else {
      return 'rgba(75, 192, 192, 0.7)'; // Green - low impact
    }
  }

  function renderStagesTable(profile) {
    if (!stagesBody) return;

    stagesBody.innerHTML = '';
    const stages = profile.stages || [];
    const totalDuration = profile.totalDuration || 0;

    stages.forEach((s) => {
      const tr = document.createElement('tr');
      const td1 = document.createElement('td');
      td1.textContent = s.eventName;

      const td2 = document.createElement('td');
      td2.textContent = Number(s.duration || 0).toFixed(2);

      const td3 = document.createElement('td');
      const percentage = totalDuration > 0 ? (s.duration / totalDuration) * 100 : 0;
      td3.textContent = `${percentage.toFixed(1)}%`;

      // Color code by percentage
      if (percentage > 50) {
        td3.style.color = 'var(--vscode-errorForeground)';
        td3.style.fontWeight = 'bold';
      } else if (percentage > 20) {
        td3.style.color = 'var(--vscode-notificationsWarningIcon-foreground)';
      }

      tr.appendChild(td1);
      tr.appendChild(td2);
      tr.appendChild(td3);
      stagesBody.appendChild(tr);
    });
  }

  function toggleView() {
    if (currentView === 'chart') {
      // Switch to table
      currentView = 'table';
      if (waterfallChartContainer) waterfallChartContainer.style.display = 'none';
      if (stagesTableContainer) stagesTableContainer.style.display = 'block';
      if (toggleViewBtn) {
        toggleViewBtn.innerHTML = '<span class="codicon codicon-graph"></span> Chart View';
      }
    } else {
      // Switch to chart
      currentView = 'chart';
      if (waterfallChartContainer) waterfallChartContainer.style.display = 'block';
      if (stagesTableContainer) stagesTableContainer.style.display = 'none';
      if (toggleViewBtn) {
        toggleViewBtn.innerHTML = '<span class="codicon codicon-table"></span> Table View';
      }
    }
  }

  function exportChart() {
    if (!chartInstance) {
      vscode.postMessage({ type: 'log', message: 'No chart available to export' });
      return;
    }

    try {
      // Get chart as PNG
      const url = waterfallCanvas.toDataURL('image/png');

      // Create download link
      const link = document.createElement('a');
      link.download = `query-profile-${Date.now()}.png`;
      link.href = url;
      link.click();

      vscode.postMessage({ type: 'log', message: 'Chart exported successfully' });
    } catch (error) {
      vscode.postMessage({ type: 'log', message: `Export failed: ${error.message}` });
    }
  }

  function showError(msg) {
    if (loading) loading.style.display = 'none';
    if (errorBox && errorMessage) { errorMessage.textContent = msg; errorBox.style.display = 'flex'; }
  }
  function hideError() { if (errorBox) errorBox.style.display = 'none'; }
  function hideLoading() { if (loading) loading.style.display = 'none'; }

  // AI Insights Functions
  function showAIInsightsLoading() {
    if (aiInsightsLoading) aiInsightsLoading.style.display = 'flex';
    if (aiInsightsError) aiInsightsError.style.display = 'none';
    if (aiInsightsContent) aiInsightsContent.style.display = 'none';
  }

  function showAIInsightsError(error) {
    if (aiInsightsLoading) aiInsightsLoading.style.display = 'none';
    if (aiInsightsError) aiInsightsError.style.display = 'flex';
    if (aiInsightsErrorMessage) aiInsightsErrorMessage.textContent = error;
    if (aiInsightsContent) aiInsightsContent.style.display = 'none';
  }

  function showAIInsights(insights) {
    if (aiInsightsLoading) aiInsightsLoading.style.display = 'none';
    if (aiInsightsError) aiInsightsError.style.display = 'none';
    if (aiInsightsContent) {
      aiInsightsContent.style.display = 'block';
      aiInsightsContent.innerHTML = renderAIInsights(insights);
    }
  }

  // Sanitize metric levels to avoid XSS (allow only known expected values)
  function sanitizeMetricLevel(str) {
    if (typeof str !== 'string') return 'unknown';
    const allowedValues = ['low', 'medium', 'high'];
    const value = str.toLowerCase();
    return allowedValues.includes(value) ? value : 'unknown';
  }

  function sanitizeSeverity(str) {
    if (typeof str !== 'string') return 'low';
    const allowedValues = ['critical', 'warning', 'info', 'low'];
    const value = str.toLowerCase();
    return allowedValues.includes(value) ? value : 'low';
  }

  function sanitizePriority(str) {
    if (typeof str !== 'string') return 'medium';
    const allowedValues = ['low', 'medium', 'high', 'critical'];
    const value = str.toLowerCase();
    return allowedValues.includes(value) ? value : 'medium';
  }

  function renderAIInsights(insights) {
    if (!insights) return '<p>No insights available.</p>';

    let html = '';

    // Summary
    if (insights.summary) {
      html += `<div class="ai-summary"><p>${escapeHtml(insights.summary)}</p></div>`;
    }

    // Metadata badges
    if (insights.metadata) {
      html += '<div class="ai-metadata">';
      if (insights.metadata.complexity) {
        const safeComplexity = sanitizeMetricLevel(insights.metadata.complexity);
        const labelComplexity = escapeHtml(insights.metadata.complexity);
        html += `<span class="metric-badge complexity-${safeComplexity}">${labelComplexity} Complexity</span>`;
      }
      if (insights.metadata.estimatedImpact) {
        const safeImpact = sanitizeMetricLevel(insights.metadata.estimatedImpact);
        const labelImpact = escapeHtml(insights.metadata.estimatedImpact);
        html += `<span class="metric-badge impact-${safeImpact}">${labelImpact} Impact</span>`;
      }
      html += '</div>';
    }

    // Anti-patterns
    if (insights.antiPatterns && insights.antiPatterns.length > 0) {
      html += '<div class="ai-antipatterns"><h4>⚠️ Issues Found</h4>';
      insights.antiPatterns.forEach(ap => {
        const severityClass = sanitizeSeverity(ap.severity);
        const severityLabel = escapeHtml(ap.severity || 'Low');
        html += `
          <div class="antipattern-item">
            <div class="antipattern-header">
              <span class="severity-icon severity-${severityClass}">●</span>
              <strong>${escapeHtml(ap.pattern)}</strong>
              <span class="severity-badge-small severity-${severityClass}">${severityLabel}</span>
            </div>
            <p class="antipattern-message">${escapeHtml(ap.message)}</p>
            ${ap.suggestion ? `<p class="antipattern-suggestion">💡 ${escapeHtml(ap.suggestion)}</p>` : ''}
          </div>`;
      });
      html += '</div>';
    }

    // Optimizations
    if (insights.optimizations && insights.optimizations.length > 0) {
      html += '<div class="ai-optimizations"><h4>✨ Optimization Suggestions</h4>';
      insights.optimizations.forEach((opt, idx) => {
        const safePriority = opt.priority ? sanitizePriority(opt.priority) : null;
        const priorityLabel = opt.priority ? escapeHtml(opt.priority) : null;
        html += `
          <div class="optimization-item">
            <div class="optimization-header">
              <span class="optimization-number">${idx + 1}</span>
              <strong>${escapeHtml(opt.suggestion)}</strong>
              <div class="optimization-badges">
                ${safePriority ? `<span class="badge priority-${safePriority}">${priorityLabel}</span>` : ''}
                ${opt.estimatedImprovement ? `<span class="badge improvement">~${escapeHtml(opt.estimatedImprovement)}</span>` : ''}
              </div>
            </div>
            <p class="optimization-description">${escapeHtml(opt.reasoning)}</p>`;

        if (opt.before || opt.after) {
          html += '<div class="optimization-code">';
          if (opt.before) {
            html += `<div class="code-block"><div class="code-label">Before:</div><pre><code>${escapeHtml(opt.before)}</code></pre></div>`;
          }
          if (opt.after) {
            html += `<div class="code-block"><div class="code-label">After:</div><pre><code>${escapeHtml(opt.after)}</code></pre></div>`;
          }
          html += '</div>';
        }

        html += '</div>';
      });
      html += '</div>';
    }

    return html;
  }

  function escapeHtml(text) {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
})();
