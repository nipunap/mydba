import { InputValidator } from '../input-validator';

describe('InputValidator.hasSQLInjectionPattern', () => {
  test('allows Performance Schema SELECT', () => {
    const sql = `SELECT COUNT(*) as disabled_count
                 FROM performance_schema.setup_consumers
                 WHERE NAME LIKE '%statements%' AND ENABLED = 'NO'`;
    expect(InputValidator.hasSQLInjectionPattern(sql)).toBe(false);
  });

  test('allows column names containing exec', () => {
    const sql = `SELECT sum_rows_examined FROM performance_schema.events_statements_summary_by_digest`;
    expect(InputValidator.hasSQLInjectionPattern(sql)).toBe(false);
  });

  test('blocks EXEC xp_cmdshell', () => {
    const sql = `EXEC xp_cmdshell 'dir'`;
    expect(InputValidator.hasSQLInjectionPattern(sql)).toBe(true);
  });

  test('blocks EXECUTE sp_executesql', () => {
    const sql = `EXECUTE sp_executesql N'SELECT 1'`;
    expect(InputValidator.hasSQLInjectionPattern(sql)).toBe(true);
  });

  test('blocks CONCAT-based injection', () => {
    const sql = `SELECT CONCAT('a', CHAR(39), 'b')`;
    expect(InputValidator.hasSQLInjectionPattern(sql)).toBe(true);
  });
});
