#!/usr/bin/env bash
# Runs every QuoteForge test suite. No dependencies — just node.
set -euo pipefail
cd "$(dirname "$0")/.."
fail=0
for suite in quoteforge/js/*.test.js; do
  node "$suite" || fail=1
done
if [ "$fail" -ne 0 ]; then
  echo "  SUITES FAILED"
  exit 1
fi
echo "  all suites passed"
