#!/usr/bin/env bash
set -euo pipefail

environment="${1:?Usage: deploy-backend.sh <environment> <image-uri>}"
image_uri="${2:?Usage: deploy-backend.sh <environment> <image-uri>}"

aws_region="${AWS_REGION:-ap-south-1}"
cluster_name="${EKS_CLUSTER_NAME:-seamarg-${environment}-eks}"
namespace="${KUBE_NAMESPACE:-seamarg}"

aws eks update-kubeconfig --region "$aws_region" --name "$cluster_name"

kubectl kustomize k8s/backend \
  | sed "s|image: seamarg-backend:latest|image: ${image_uri}|g" \
  | kubectl apply -f -

kubectl -n "$namespace" rollout status deployment/seamarg-backend --timeout=5m
kubectl -n "$namespace" get service seamarg-backend
