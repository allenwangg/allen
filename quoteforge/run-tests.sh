#!/usr/bin/env bash
# Runs the QuoteForge test suites.
#   ./run-tests.sh          unit suites only (no dependencies, always runnable)
#   ./run-tests.sh --all    also runs the browser suite (needs playwright + chromium)
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
for suite in quoteforge/js/*.test.js; do
  node "$suite" || fail=1
done

if [ "${1:-}" = "--all" ]; then
  echo "  browser suite"
  node quoteforge/test/browser.mjs || fail=1
  echo "  change order suite"
  node quoteforge/test/change-orders.mjs || fail=1
  echo "  job cost suite"
  node quoteforge/test/job-costs.mjs || fail=1
  echo "  accessibility suite"
  node quoteforge/test/accessibility.mjs || fail=1
  echo "  security suite"
  node quoteforge/test/security.mjs || fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "  SUITES FAILED"
  exit 1
fi
echo "  all suites passed"
