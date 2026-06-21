#!/usr/bin/env bash
set -euo pipefail

environment="${1:?Usage: deploy-frontend.sh <environment> [dist-path]}"
dist_path="${2:-frontend/dist}"

if [[ ! -d "$dist_path" ]]; then
  echo "Frontend build directory was not found at: $dist_path" >&2
  exit 1
fi

echo "Frontend build ready for ${environment}: ${dist_path}"
echo "Add frontend deployment commands here."
