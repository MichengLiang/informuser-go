#!/usr/bin/env bash
set -euo pipefail

threshold="${GO_CORE_COVERAGE_THRESHOLD:-85.0}"
profile="tmp/go-core-coverage.out"

mkdir -p tmp

mapfile -t packages < <(go list ./internal/... | grep -v '/internal/webui$')
coverpkg="$(IFS=,; echo "${packages[*]}")"

go test "${packages[@]}" \
  -coverpkg="$coverpkg" \
  -coverprofile="$profile" \
  -covermode=atomic

total_line="$(go tool cover -func="$profile" | tee /dev/stderr | awk '/^total:/ {print $3}')"
coverage="${total_line%\%}"

awk -v coverage="$coverage" -v threshold="$threshold" 'BEGIN {
  if (coverage + 0 < threshold + 0) {
    printf("Go core coverage %.1f%% is below %.1f%%\n", coverage, threshold) > "/dev/stderr"
    exit 1
  }
  printf("Go core coverage %.1f%% meets %.1f%% threshold\n", coverage, threshold)
}'
