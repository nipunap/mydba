# Unit Test Plan for Milestone 3 Features

## Overview
This document outlines the unit test strategy for the critical components and security fixes implemented in Milestone 3.

## Test Structure

Tests will be organized using Jest with the following structure:
```
src/
├── services/
│   └── __tests__/
│       └── queries-without-indexes-service.test.ts
├── webviews/
│   └── __tests__/
│       ├── explain-viewer-panel.test.ts
│       ├── metrics-dashboard-panel.test.ts
│       └── queries-without-indexes-panel.test.ts
└── utils/
    └── __tests__/
        └── validator.test.ts (existing)
```

## Test Categories

### 1. Security Tests (HIGHEST PRIORITY)

#### queries-without-indexes-service.test.ts

**Test: SQL Injection Prevention**
```typescript
describe('Security: SQL Injection Prevention', () => {
  test('should reject schema name with SQL keywords', () => {
    expect(() => service.findUnusedIndexes(adapter, 'test; DROP TABLE users;'))
      .toThrow('Invalid schema name');
  });

  test('should reject schema name with special characters', () => {
    expect(() => service.findUnusedIndexes(adapter, 'test/../'))
      .toThrow('Invalid schema name');
  });

  test('should accept valid schema names', async () => {
    const result = await service.findUnusedIndexes(adapter, 'valid_schema');
    expect(result).toBeDefined();
  });

  test('should reject schema name starting with number', () => {
    expect(() => service.findUnusedIndexes(adapter, '123schema'))
      .toThrow('Invalid schema name');
  });

  test('should accept schema names with underscore', async () => {
    const result = await service.findUnusedIndexes(adapter, 'test_schema_123');
    expect(result).toBeDefined();
  });
});
```

#### explain-viewer-panel.test.ts

**Test: Export Size Limitation**
```typescript
describe('Security: Export Size Limitation', () => {
  test('should reject export > 10MB', async () => {
    const largeData = { data: 'x'.repeat(11 * 1024 * 1024) };
    await expect(panel.handleExport('json', largeData))
      .rejects.toThrow(/too large/);
  });

  test('should allow export < 10MB', async () => {
    const smallData = { data: 'x'.repeat(1024 * 1024) };
    await expect(panel.handleExport('json', smallData)).resolves.not.toThrow();
  });

  test('should show error message for oversized export', async () => {
    const largeData = { data: 'x'.repeat(11 * 1024 * 1024) };
    const mockShowError = jest.spyOn(vscode.window, 'showErrorMessage');
    await panel.handleExport('json', largeData);
    expect(mockShowError).toHaveBeenCalledWith(
      expect.stringContaining('too large')
    );
  });
});
```

#### metrics-dashboard-panel.test.ts

**Test: Memory Leak Prevention**
```typescript
describe('Security: Memory Leak Prevention', () => {
  test('should clear alertStates on dispose', () => {
    const panel = new MetricsDashboardPanel(...);
    panel.alertStates.set('test', true);
    panel.dispose();
    expect(panel.alertStates.size).toBe(0);
  });

  test('should not accumulate alert states across refreshes', () => {
    const panel = new MetricsDashboardPanel(...);
    // Simulate multiple alerts
    for (let i = 0; i < 100; i++) {
      panel.checkAlerts({ ...mockMetrics });
    }
    expect(panel.alertStates.size).toBeLessThan(10); // Only active alerts
  });
});
```

### 2. Core Functionality Tests (HIGH PRIORITY)

#### queries-without-indexes-service.test.ts

**Test: Index Health Detection**
```typescript
describe('Index Health Detection', () => {
  test('should detect unused indexes', async () => {
    const unusedIndexes = await service.findUnusedIndexes(adapter, 'test_schema');
    expect(unusedIndexes).toHaveLength(2);
    expect(unusedIndexes[0]).toHaveProperty('table_name');
    expect(unusedIndexes[0]).toHaveProperty('index_name');
  });

  test('should detect duplicate indexes', async () => {
    const duplicates = await service.findDuplicateIndexes(adapter, 'test_schema');
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].columns).toContain('user_id');
  });

  test('should return empty array when no issues found', async () => {
    const unused = await service.findUnusedIndexes(adapter, 'perfect_schema');
    expect(unused).toHaveLength(0);
  });
});
```

#### metrics-dashboard-panel.test.ts

**Test: Alert System**
```typescript
describe('Alert System', () => {
  test('should trigger critical alert at 95% connection usage', async () => {
    const metrics = { ...mockMetrics, connections: { current: 95, max: 100 } };
    await panel.checkAlerts(metrics);
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('CRITICAL')
    );
  });

  test('should trigger warning alert at 80% connection usage', async () => {
    const metrics = { ...mockMetrics, connections: { current: 80, max: 100 } };
    await panel.checkAlerts(metrics);
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('WARNING')
    );
  });

  test('should not spam alerts for same condition', async () => {
    const metrics = { ...mockMetrics, connections: { current: 95, max: 100 } };
    const showErrorMock = jest.spyOn(vscode.window, 'showErrorMessage');

    // Trigger twice
    await panel.checkAlerts(metrics);
    await panel.checkAlerts(metrics);

    // Should only show once due to state tracking
    expect(showErrorMock).toHaveBeenCalledTimes(1);
  });

  test('should reset alert state when condition clears', async () => {
    const highUsageMetrics = { ...mockMetrics, connections: { current: 95, max: 100 } };
    const lowUsageMetrics = { ...mockMetrics, connections: { current: 50, max: 100 } };

    await panel.checkAlerts(highUsageMetrics);
    await panel.checkAlerts(lowUsageMetrics);
    await panel.checkAlerts(highUsageMetrics);

    // Should show alert again after state reset
    expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(2);
  });
});
```

### 3. Edge Cases & Error Handling (MEDIUM PRIORITY)

#### explain-viewer-panel.test.ts

**Test: Export Error Handling**
```typescript
describe('Export Error Handling', () => {
  test('should handle null data gracefully', async () => {
    await expect(panel.handleExport('json', null)).rejects.toThrow();
  });

  test('should show error for missing export data', async () => {
    const mockShowError = jest.spyOn(vscode.window, 'showErrorMessage');
    await panel.handleExport('json');
    expect(mockShowError).toHaveBeenCalledWith(
      expect.stringContaining('No data available')
    );
  });

  test('should handle file save cancellation', async () => {
    const mockShowDialog = jest.spyOn(vscode.window, 'showSaveDialog')
      .mockResolvedValue(undefined);

    await panel.handleExport('json', mockData);
    expect(mockShowDialog).toHaveBeenCalled();
  });
});
```

#### queries-without-indexes-panel.test.ts

**Test: Configuration Loading**
```typescript
describe('Configuration Loading', () => {
  test('should load thresholds from configuration', async () => {
    const config = {
      minAvgRowsExamined: 5000,
      minExecutions: 10
    };
    const queries = await service.detectQueriesWithoutIndexes(adapter);
    // Verify queries are filtered by config
    expect(queries.every(q => q.avgRowsExamined >= 5000)).toBe(true);
  });

  test('should handle Performance Schema disabled gracefully', async () => {
    const error = new PerformanceSchemaConfigurationError('Not configured', {
      needsInstruments: true,
      needsConsumers: true,
      instrumentCount: 10,
      consumerCount: 5
    });
    await expect(service.detectQueriesWithoutIndexes(adapter))
      .rejects.toThrow('Performance Schema');
  });
});
```

### 4. Performance Tests (LOW PRIORITY)

#### explain-viewer-panel.test.ts

**Test: Debouncing Performance**
```typescript
describe('Search Debouncing', () => {
  test('should debounce search input to prevent excessive renders', async () => {
    const mockRender = jest.spyOn(panel, 'renderTreeDiagram');
    const searchInput = document.getElementById('search-input');

    // Simulate rapid input
    for (let i = 0; i < 10; i++) {
      searchInput.dispatchEvent(new Event('input'));
    }

    await new Promise(resolve => setTimeout(resolve, 400));

    // Should only render once due to debouncing
    expect(mockRender).toHaveBeenCalledTimes(1);
  });
});
```

## Test Coverage Goals

### Minimum Coverage Requirements
- **Security-critical functions**: 100% coverage
- **Core business logic**: 90% coverage
- **Error handling paths**: 80% coverage
- **Overall project**: 75% coverage

### Priority Order
1. ✅ SQL injection prevention tests
2. ✅ Export size limitation tests
3. ✅ Memory leak prevention tests
4. ✅ Alert system functionality tests
5. ✅ Index detection functionality tests
6. ⚠️ Error handling edge cases
7. ⚠️ Performance optimization tests

## Mock Strategy

### Mocked Dependencies
- `vscode` API methods (window.showErrorMessage, etc.)
- Database adapter methods
- Configuration values
- DOM elements (for webview tests)
- File system operations

### Example Mock Setup
```typescript
jest.mock('vscode', () => ({
  window: {
    showErrorMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    showSaveDialog: jest.fn()
  },
  workspace: {
    getConfiguration: jest.fn(() => ({
      get: jest.fn((key: string) => defaults[key])
    }))
  }
}));
```

## Test Execution

### Run All Tests
```bash
npm run test:unit
```

### Run with Coverage
```bash
npm run test:unit -- --coverage
```

### Run Specific Test
```bash
npm run test:unit -- queries-without-indexes-service.test
```

### Watch Mode
```bash
npm run test:unit -- --watch
```

## Test Data

### Test Database Setup
Create a test database with:
- Sample tables with indexes
- Some unused indexes
- Duplicate indexes
- Queries with various performance characteristics

### Sample Data File
`test/data/index-health-data.sql`

## CI/CD Integration

Tests will run automatically on:
- Pull request creation
- Push to main branch
- Nightly builds

Coverage reports will be uploaded to code coverage service.

## Notes

- Tests should be isolated and not depend on each other
- Use beforeEach/afterEach for cleanup
- Mock external dependencies completely
- Test both success and failure paths
- Include boundary condition tests
- Test security validation thoroughly
