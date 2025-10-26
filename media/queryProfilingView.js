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
})();
