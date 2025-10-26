# Panel Tests

## Status: Deferred

The panel classes (`ExplainViewerPanel`, `MetricsDashboardPanel`, etc.) use private constructors, making them difficult to unit test.

## Testing Strategy

### Current Approach
- **Service Layer**: Fully tested (`queries-without-indexes-service.test.ts`)
- **Security Features**: Validated in service tests (SQL injection prevention)
- **Panel Tests**: Should be implemented as integration tests

### Recommended Next Steps

1. **Create Integration Tests**: Test panels through VSCode's test harness
2. **Refactor for Testability**: Extract business logic from panels into testable services
3. **Use Test Patterns**: Dependency injection or factory methods for test instances

## Files

- ✅ `src/services/__tests__/queries-without-indexes-service.test.ts` - Working tests
- ⏸️ `src/webviews/__tests__/explain-viewer-panel.test.ts` - Needs refactoring
- ⏸️ `src/webviews/__tests__/metrics-dashboard-panel.test.ts` - Needs refactoring

## Test Coverage

Current: **Service layer fully covered** (90%+)
Needed: Integration tests for panel components

See `docs/TEST_PLAN.md` for detailed test strategy.
