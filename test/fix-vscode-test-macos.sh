#!/bin/bash
# Fix VS Code test installation codesigning issues on macOS

echo "Fixing VS Code test installation for macOS..."

VSCODE_TEST_DIR=".vscode-test"

if [ ! -d "$VSCODE_TEST_DIR" ]; then
    echo "❌ .vscode-test directory not found. Run tests once to download VS Code first."
    exit 1
fi

echo "📋 Removing quarantine attribute from VS Code.app..."
find "$VSCODE_TEST_DIR" -name "Visual Studio Code.app" -exec xattr -dr com.apple.quarantine {} \; 2>/dev/null || true

echo "🔓 Setting permissions on VS Code files..."
find "$VSCODE_TEST_DIR" -type d -exec chmod u+w {} \; 2>/dev/null || true
find "$VSCODE_TEST_DIR" -type f -exec chmod u+w {} \; 2>/dev/null || true

echo "✅ Done! You can now run 'npm test' again."
echo ""
echo "Note: If the problem persists, you may need to:"
echo "1. Delete .vscode-test manually from Finder with sudo"
echo "2. Or run: sudo rm -rf .vscode-test"
echo "3. Then run this script again after tests download VS Code"
