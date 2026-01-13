#!/bin/bash
# UI Integration Gate: unit + critical-path e2e (+ optional conformance)
set -euo pipefail

repeat="${UI_GATE_REPEAT:-1}"
conformance="${UI_GATE_CONFORMANCE:-0}"

if ! [[ "$repeat" =~ ^[0-9]+$ ]] || [ "$repeat" -lt 1 ]; then
  echo "UI_GATE_REPEAT must be a positive integer (got: $repeat)" >&2
  exit 1
fi

echo "UI Gate: unit tests"
pnpm test:unit

for ((i = 1; i <= repeat; i++)); do
  echo "UI Gate: e2e critical path (run $i/$repeat)"
  pnpm test:e2e:smoke
done

if [ "$conformance" = "1" ]; then
  echo "UI Gate: conformance"
  bash scripts/conformance-gate.sh
fi
