#!/bin/bash
# Conformance gate for LFCC (fast CI profile)
set -euo pipefail

echo "Running LFCC conformance gate (ci-fast)..."
pnpm --filter @keepup/conformance-kit conformance:ci-fast
