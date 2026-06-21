#!/usr/bin/env bash
set -euo pipefail

environment="${1:?Usage: deploy-lambda.sh <environment> [dist-path]}"
dist_path="${2:-lambda/dist}"

if [[ ! -d "$dist_path" ]]; then
  echo "Lambda build directory was not found at: $dist_path" >&2
  exit 1
fi

echo "Lambda build ready for ${environment}: ${dist_path}"
echo "Add Lambda deployment commands here."
