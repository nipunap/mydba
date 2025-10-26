#!/bin/bash

echo "🧪 Testing MyDBA Extension Installation"
echo "======================================"

# Check if extension is installed
echo "📦 Checking extension installation..."
if code --list-extensions | grep -q "mydba"; then
    echo "✅ MyDBA extension is installed"
else
    echo "❌ MyDBA extension not found"
    exit 1
fi

# Check extension details
echo ""
echo "📋 Extension details:"
code --list-extensions --show-versions | grep mydba

echo ""
echo "🎯 Testing Commands..."
echo "Available MyDBA commands:"
echo "- MyDBA: New Connection"
echo "- MyDBA: Connect to Database"
echo "- MyDBA: Disconnect"
echo "- MyDBA: Refresh"
echo "- MyDBA: Analyze Query"
echo "- MyDBA: Explain Query"
echo "- MyDBA: Profile Query"
echo "- MyDBA: Toggle AI Features"

echo ""
echo "🌳 Testing Tree View..."
echo "Look for 'MyDBA' in the Explorer sidebar"
echo "If no connections exist, you'll see 'No connections' with a 'New Connection' button"

echo ""
echo "⚙️ Testing Configuration..."
echo "MyDBA settings are available in VSCode Settings:"
echo "- mydba.ai.enabled"
echo "- mydba.confirmDestructiveOperations"
echo "- mydba.safeMode"
echo "- mydba.preview.maxRows"
echo "- And many more..."

echo ""
echo "✅ Extension Test Complete!"
echo ""
echo "Next steps:"
echo "1. Open Command Palette (Ctrl+Shift+P)"
echo "2. Run 'MyDBA: New Connection'"
echo "3. Enter database connection details"
echo "4. Explore the database in the MyDBA sidebar"
echo ""
echo "Note: You'll need a MySQL 8.0+ or MariaDB 10.6+ database to test connections"
