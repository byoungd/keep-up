#!/bin/bash
# UI Integration Gate: unit + critical-path e2e (+ optional conformance)
set -euo pipefail

repeat="${UI_GATE_REPEAT:-1}"
conformance="${UI_GATE_CONFORMANCE:-0}"
log_dir="${UI_GATE_LOG_DIR:-test-results}"
targeted_log="${log_dir}/final_targeted_test.log"
full_log="${log_dir}/full_verification.log"

if ! [[ "$repeat" =~ ^[0-9]+$ ]] || [ "$repeat" -lt 1 ]; then
  echo "UI_GATE_REPEAT must be a positive integer (got: $repeat)" >&2
  exit 1
fi

if [ -z "$log_dir" ]; then
  log_dir="test-results"
  targeted_log="${log_dir}/final_targeted_test.log"
  full_log="${log_dir}/full_verification.log"
fi

mkdir -p "$log_dir"
: > "$targeted_log"
: > "$full_log"
exec > >(tee "$full_log") 2>&1

echo "UI Gate: unit tests"
pnpm test:unit

for ((i = 1; i <= repeat; i++)); do
  echo "UI Gate: e2e critical path (run $i/$repeat)"
  if node -e "const pkg=require('./package.json'); process.exit(pkg.scripts && pkg.scripts['test:e2e:smoke'] ? 0 : 1)"; then
    pnpm test:e2e:smoke 2>&1 | tee -a "$targeted_log"
  else
    echo "UI Gate: e2e smoke skipped (test:e2e:smoke not defined)" | tee -a "$targeted_log"
  fi
done

if [ "$conformance" = "1" ]; then
  echo "UI Gate: conformance"
  bash scripts/conformance-gate.sh
fi
