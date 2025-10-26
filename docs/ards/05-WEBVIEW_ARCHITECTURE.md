# Webview Architecture ARD

**Document Type**: Architecture Requirement Document (ARD)
**Version**: 1.0
**Last Updated**: October 25, 2025
**Status**: Approved for Implementation

---

## 1. Overview

Define webview architecture for EXPLAIN visualizations, dashboards, and interactive UI components within VSCode.

---

## 2. Webview Components

### 2.1 EXPLAIN Plan Viewer
- **Technology**: D3.js or Mermaid.js for tree diagrams
- **Features**: Color-coded severity, pain point highlighting, one-click fixes
- **Performance**: < 300ms render time, collapse large plans

### 2.2 Query Profiling Viewer
- **Technology**: Plotly.js for waterfall charts
- **Features**: Stage timeline, metrics summary, AI insights
- **Data**: Performance Schema events (MySQL 8.0+)

### 2.3 Database Dashboard
- **Technology**: Chart.js for metrics
- **Features**: Real-time charts, connection status, query stats
- **Updates**: 5-second polling, pause when inactive

---

## 3. Architecture

### 3.1 Webview Provider Pattern
```typescript
abstract class BaseWebviewProvider implements vscode.WebviewViewProvider {
  protected _view?: vscode.WebviewView;

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.getResourceRoot()]
    };
    webviewView.webview.html = this.getHtml();
    this.setupMessageHandlers();
  }

  protected abstract getHtml(): string;
  protected abstract setupMessageHandlers(): void;
}
```

### 3.2 Message Passing
```typescript
// Extension → Webview
webview.postMessage({
  type: 'updateData',
  data: explainResult
});

// Webview → Extension
webview.onDidReceiveMessage(async (message) => {
  switch (message.type) {
    case 'applyIndex':
      await this.applyIndexSuggestion(message.indexDDL);
      break;
    case 'refreshData':
      await this.refreshMetrics();
      break;
  }
});
```

---

## 4. Security (CSP)

### 4.1 Content Security Policy
```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none';
               script-src 'unsafe-inline' 'unsafe-eval';
               style-src 'unsafe-inline';
               img-src data: https:;">
```

### 4.2 Resource Loading
- **Scripts**: Bundled with extension (no CDN)
- **Styles**: Inline CSS only
- **Images**: Data URIs or local resources
- **Fonts**: System fonts only

---

## 5. Performance

### 5.1 Lazy Loading
- Webviews created on-demand
- Data fetched when webview becomes visible
- Dispose when hidden for > 5 minutes

### 5.2 Memory Management
- Max 3 webviews active simultaneously
- Dispose unused webviews after 5 minutes
- Clear large datasets on dispose

---

## 6. UI Components

### 6.1 EXPLAIN Tree Diagram
```typescript
interface ExplainNode {
  id: string;
  operation: string;
  cost: number;
  rows: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  children: ExplainNode[];
  suggestion?: IndexSuggestion;
}
```

### 6.2 Profiling Timeline
```typescript
interface ProfilingStage {
  name: string;
  duration: number;
  percentage: number;
  color: string; // Based on severity
}
```

---

## 7. Testing

### 7.1 Webview Tests
```typescript
describe('ExplainViewer', () => {
  it('should render tree diagram', async () => {
    const provider = new ExplainViewerProvider();
    const webview = await provider.createWebview(explainResult);

    expect(webview.html).toContain('explain-tree');
    expect(webview.html).toContain('D3.js');
  });
});
```

---

**Status**: Approved
**Next Steps**: Implement base webview provider, EXPLAIN viewer, profiling timeline
