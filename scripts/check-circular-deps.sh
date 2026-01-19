#!/bin/bash
# Circular Dependency Check
# Prevents new circular dependencies from being introduced.
# Uses madge to detect cycles in TypeScript imports.

set -e

PACKAGES=(
  "packages/core/src/index.ts"
  "packages/agent-runtime/src/index.ts"
  "packages/ai-core/src/index.ts"
  "packages/lfcc-bridge/src/index.ts"
)

FAILED=0
CHECKED=0

echo "🔍 Checking for circular dependencies..."
echo ""

for pkg in "${PACKAGES[@]}"; do
  if [ ! -f "$pkg" ]; then
    echo "⚠️  Skipping $pkg (file not found)"
    continue
  fi

  CHECKED=$((CHECKED + 1))
  PKG_NAME=$(dirname "$pkg" | sed 's|packages/||' | sed 's|/src||')

  echo "📦 Checking $PKG_NAME..."

  # Run madge with circular detection
  # --extensions ts: Only check TypeScript files
  # --exclude: Skip dist and node_modules to avoid type definition cycles
  OUTPUT=$(pnpm madge --circular --extensions ts --exclude 'dist|node_modules' "$pkg" 2>&1)

  if echo "$OUTPUT" | grep -q "Found .* circular"; then
    echo "❌ $PKG_NAME has circular dependencies:"
    echo "$OUTPUT" | grep -A 100 "Found .* circular"
    FAILED=$((FAILED + 1))
  else
    echo "✅ $PKG_NAME - no circular dependencies"
  fi
  echo ""
done

echo "────────────────────────────────────"
echo "📊 Summary: $CHECKED packages checked"

if [ $FAILED -gt 0 ]; then
  echo "❌ $FAILED package(s) have circular dependencies"
  echo ""
  echo "💡 To fix circular dependencies:"
  echo "   1. Run: pnpm madge --circular --extensions ts <package>/src/index.ts"
  echo "   2. Identify the cycle and refactor to break it"
  echo "   3. Consider extracting shared types to a separate file"
  exit 1
fi

echo "✅ All packages clean!"
exit 0
