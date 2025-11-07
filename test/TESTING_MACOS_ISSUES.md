# Testing on macOS - Known Issues and Solutions

## Issue: VS Code Integration Tests Fail on macOS

### Symptoms

```
Error: bad option: --disable-extensions
Error: bad option: --disable-gpu
Exit code: 9
Failed to run tests: TestRunFailedError: Test run failed with code 9
```

### Root Cause

The VS Code test harness downloads a copy of VS Code to `.vscode-test/`. On macOS, this downloaded application:
1. Is quarantined by macOS Gatekeeper
2. Has codesigning issues (SecCodeCheckValidity errors)
3. Files are protected by macOS System Integrity Protection (SIP)

These security measures prevent the test runner from executing VS Code with command-line options.

## Solutions

### Solution 1: Use the Fix Script (Recommended)

We've provided a script to fix the codesigning issues:

```bash
# Run this after the first test attempt downloads VS Code
./test/fix-vscode-test-macos.sh
```

Then run tests again:
```bash
npm test
```

### Solution 2: Manual Fix

1. Remove quarantine attribute:
   ```bash
   xattr -dr com.apple.quarantine .vscode-test/vscode-darwin-arm64-*/Visual\ Studio\ Code.app
   ```

2. Set proper permissions:
   ```bash
   chmod -R u+w .vscode-test
   ```

3. Run tests again:
   ```bash
   npm test
   ```

### Solution 3: Delete and Retry with Sudo

If the above doesn't work:

```bash
# Delete the problematic installation
sudo rm -rf .vscode-test

# Run tests (will download fresh copy)
npm test

# Immediately after download completes, run the fix script
./test/fix-vscode-test-macos.sh

# Run tests again
npm test
```

### Solution 4: Skip Integration Tests, Use Unit Tests

If you only need to run unit tests:

```bash
npm run test:unit
```

This skips the VS Code integration tests and runs Jest unit tests only.

### Solution 5: Use Docker for Integration Tests

Run tests in a Docker container (recommended for CI/CD):

```bash
# With MariaDB
npm run test:mariadb

# With MySQL
npm run test:mysql

# With all databases
npm run test:db
```

## Prevention

This issue typically occurs once per VS Code version. Once fixed, it shouldn't recur until VS Code is updated.

### For CI/CD (GitHub Actions, etc.)

Use Linux runners instead of macOS runners for integration tests:

```yaml
runs-on: ubuntu-latest  # Instead of macos-latest
```

## Additional Notes

### Why This Happens

- **Gatekeeper**: macOS security feature that quarantines downloaded apps
- **Code Signing**: Downloaded VS Code isn't properly signed for your system
- **SIP**: System Integrity Protection prevents modification of certain files

### Verifying the Fix

After applying a fix, you should see:

```bash
npm test

> mydba@1.1.0 test
> node ./out/test/runTest.js

✔ Validated version: 1.105.1
✔ Found existing install
✔ Running tests...
```

## Related Issues

- [vscode-test #196](https://github.com/microsoft/vscode-test/issues/196)
- [vscode-test #240](https://github.com/microsoft/vscode-test/issues/240)

## Support

If you continue to have issues:
1. Check that you're using the latest @vscode/test-electron
2. Try deleting `node_modules` and `package-lock.json`, then `npm install`
3. Ensure macOS is up to date
4. Consider using Docker for consistent test environments
