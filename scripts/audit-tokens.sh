#!/bin/bash

set -euo pipefail

echo "=== Hardcoded Gray Colors ==="
rg "gray-[0-9]" apps/cowork/src packages/shell/src --glob "*.tsx" --glob "*.ts" || true

echo "=== Hardcoded Zinc Colors ==="
rg "zinc-[0-9]" apps/cowork/src packages/shell/src --glob "*.tsx" --glob "*.ts" || true

echo "=== Hex Colors ==="
rg "#[0-9a-fA-F]{3,6}" apps/cowork/src packages/shell/src --glob "*.tsx" --glob "*.ts" || true

echo "=== Transition without duration ==="
rg "transition-(colors|all)" apps/cowork/src packages/shell/src --glob "*.tsx" --glob "*.ts" \
  | rg -v "duration-" || true
