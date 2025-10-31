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

  // AI insights elements
  const aiInsightsLoading = document.getElementById('ai-insights-loading');
  const aiInsightsError = document.getElementById('ai-insights-error');
  const aiInsightsErrorMessage = document.getElementById('ai-insights-error-message');
  const aiInsightsContent = document.getElementById('ai-insights-content');

  window.addEventListener('error', (e) => showError(e.error?.message || e.message || 'Unknown error'), { once: true });
  reprofileBtn?.addEventListener('click', () => vscode.postMessage({ type: 'reprofile' }));

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
    totalDuration.textContent = `${Number(profile.totalDuration || 0).toFixed(2)}`;
    rowsExamined.textContent = `${Number(profile.summary.totalRowsExamined || 0)}`;
    rowsSent.textContent = `${Number(profile.summary.totalRowsSent || 0)}`;
    efficiency.textContent = `${Number(profile.summary.efficiency || 0).toFixed(2)}%`;
    queryText.textContent = query;

    stagesBody.innerHTML = '';
    (profile.stages || []).forEach((s) => {
      const tr = document.createElement('tr');
      const td1 = document.createElement('td'); td1.textContent = s.eventName;
      const td2 = document.createElement('td'); td2.textContent = Number(s.duration || 0).toFixed(2);
      tr.appendChild(td1); tr.appendChild(td2);
      stagesBody.appendChild(tr);
    });
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
