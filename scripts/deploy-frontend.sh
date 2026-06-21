#!/usr/bin/env bash
set -euo pipefail

usage="Usage: deploy-frontend.sh <environment> [dist-path] [bucket-name] [cloudfront-distribution-id] [cloudfront-domain-name]"

environment="${1:?$usage}"
dist_path="${2:-frontend/dist}"
bucket_name="${FRONTEND_BUCKET_NAME:-${3:-}}"
distribution_id="${CLOUDFRONT_DISTRIBUTION_ID:-${4:-}}"
domain_name="${CLOUDFRONT_DOMAIN_NAME:-${5:-}}"

if [[ ! -d "$dist_path" ]]; then
  echo "Frontend build directory was not found at: ${dist_path}" >&2
  exit 1
fi

if [[ -z "$bucket_name" ]]; then
  echo "Set FRONTEND_BUCKET_NAME or pass bucket-name as the third argument." >&2
  exit 1
fi

if [[ -z "$distribution_id" ]]; then
  echo "Set CLOUDFRONT_DISTRIBUTION_ID or pass cloudfront-distribution-id as the fourth argument." >&2
  exit 1
fi

echo "Deploying ${environment} frontend from ${dist_path} to s3://${bucket_name}"

aws s3 sync "${dist_path}/" "s3://${bucket_name}/" \
  --delete \
  --exclude "assets/*" \
  --cache-control "public,max-age=300" \
  --only-show-errors

if [[ -d "${dist_path}/assets" ]]; then
  aws s3 sync "${dist_path}/assets/" "s3://${bucket_name}/assets/" \
    --delete \
    --cache-control "public,max-age=31536000,immutable" \
    --only-show-errors
fi

if [[ -f "${dist_path}/index.html" ]]; then
  aws s3 cp "${dist_path}/index.html" "s3://${bucket_name}/index.html" \
    --cache-control "no-cache,no-store,must-revalidate" \
    --content-type "text/html; charset=utf-8" \
    --only-show-errors
fi

echo "Creating CloudFront invalidation for distribution ${distribution_id}"
invalidation_id="$(
  aws cloudfront create-invalidation \
    --distribution-id "$distribution_id" \
    --paths "/*" \
    --query "Invalidation.Id" \
    --output text
)"

aws cloudfront wait invalidation-completed \
  --distribution-id "$distribution_id" \
  --id "$invalidation_id"

echo "CloudFront invalidation completed: ${invalidation_id}"

if [[ -n "$domain_name" ]]; then
  echo "Frontend URL: https://${domain_name}"
fi
