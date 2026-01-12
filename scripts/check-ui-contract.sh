#!/bin/bash
# UI Contract Enforcement Script
# See docs/architecture/UI_CONTRACT.md for details
set -euo pipefail

echo "Checking UI Contract violations..."

UI_ROOTS=(
  "apps/reader/src/components"
  "apps/reader/app"
)

EXCEPTION_FILES=(
  "apps/reader/src/components/lfcc/VirtualizedDocView.tsx"
  "apps/reader/src/components/lfcc/useLfccBridge.ts"
  "apps/reader/src/components/editor/AIContextMenu.tsx"
  "apps/reader/src/components/lfcc/DebugOverlay/LfccDebugOverlay.tsx"
)

EXCLUDE_DIRS=(
  "node_modules"
  "dist"
  ".next"
  "coverage"
  ".turbo"
  "api"
)

GREP_ARGS=(--include="*.ts" --include="*.tsx")
for dir in "${EXCLUDE_DIRS[@]}"; do
  GREP_ARGS+=(--exclude-dir="$dir")
done

filter_exceptions() {
  local input="$1"
  if [ -z "$input" ]; then
    printf "%s" "$input"
    return
  fi
  local output="$input"
  for exception in "${EXCEPTION_FILES[@]}"; do
    output=$(printf "%s\n" "$output" | grep -v -F "$exception" || true)
  done
  printf "%s" "$output"
}

collect_violations() {
  local pattern="$1"
  local matches=""
  for root in "${UI_ROOTS[@]}"; do
    if [ -d "$root" ]; then
      local found
      found=$(grep -rn -E "$pattern" "$root" "${GREP_ARGS[@]}" 2>/dev/null || true)
      if [ -n "$found" ]; then
        matches="${matches}"$'\n'"${found}"
      fi
    fi
  done
  matches=$(filter_exceptions "$matches")
  printf "%s\n" "$matches" | sed '/^$/d'
}

has_violation=0

report_violations() {
  local label="$1"
  local pattern="$2"
  local hint="$3"
  local matches
  matches=$(collect_violations "$pattern")
  if [ -n "$matches" ]; then
    echo "❌ UI Contract Violation: $label"
    echo "$matches"
    echo ""
    echo "$hint"
    echo ""
    has_violation=1
  fi
}

report_violations \
  "Direct loro-crdt imports found" \
  "from ['\"]loro-crdt['\"]" \
  "Use @keepup/lfcc-bridge instead. See docs/architecture/UI_CONTRACT.md"

report_violations \
  "Internal CRDT imports found" \
  "from ['\"]@keepup/lfcc-bridge/crdt" \
  "Use DocumentFacade or BridgeController instead."

report_violations \
  "Direct CRDT tree reads found" \
  "readBlockTree\\s*\\(|getRootBlocks\\s*\\(" \
  "Use DocumentFacade.getBlocks() instead."

report_violations \
  "Direct Loro runtime access found" \
  "runtime\\.doc\\.(getMap|getList|getText|subscribe|frontiers|version|setPeerId|peerIdStr)" \
  "Use BridgeController or DocumentFacade APIs instead."

if [ "$has_violation" -ne 0 ]; then
  exit 1
fi

echo "✅ UI Contract: No violations found"
