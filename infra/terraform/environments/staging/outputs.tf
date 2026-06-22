output "environment" {
  description = "Terraform environment name."
  value       = var.environment
}

output "backend_ecr_repository_name" {
  description = "Backend ECR repository name."
  value       = module.backend.ecr_repository_name
}

output "backend_ecr_repository_url" {
  description = "Backend ECR repository URL."
  value       = module.backend.ecr_repository_url
}

output "eks_cluster_name" {
  description = "Backend EKS cluster name."
  value       = module.backend.eks_cluster_name
}

output "github_actions_role_arn" {
  description = "GitHub Actions deployment role ARN."
  value       = module.backend.github_actions_role_arn
}

output "frontend_bucket_name" {
  description = "Private S3 bucket used for frontend static assets."
  value       = module.frontend.bucket_name
}

output "frontend_cloudfront_distribution_id" {
  description = "CloudFront distribution ID for frontend hosting."
  value       = module.frontend.cloudfront_distribution_id
}

output "frontend_cloudfront_domain_name" {
  description = "CloudFront domain name for frontend hosting."
  value       = module.frontend.cloudfront_domain_name
}

output "frontend_cloudfront_hosted_zone_id" {
  description = "CloudFront hosted zone ID for a future Route 53 alias record."
  value       = module.frontend.cloudfront_hosted_zone_id
}

output "cognito_user_pool_id" {
  description = "Cognito user pool ID for customer authentication."
  value       = module.auth.user_pool_id
}

output "cognito_user_pool_arn" {
  description = "Cognito user pool ARN for customer authentication."
  value       = module.auth.user_pool_arn
}

output "cognito_app_client_id" {
  description = "Cognito frontend app client ID."
  value       = module.auth.app_client_id
}

output "cognito_issuer_uri" {
  description = "Issuer URI to set as COGNITO_ISSUER_URI in the backend."
  value       = module.auth.issuer_uri
}

output "cognito_jwks_uri" {
  description = "JWKS URI used by JWT validators."
  value       = module.auth.jwks_uri
}

output "cognito_hosted_ui_base_url" {
  description = "Cognito hosted UI base URL."
  value       = module.auth.hosted_ui_base_url
}

output "cognito_callback_urls" {
  description = "Callback URLs registered with the Cognito frontend app client."
  value       = module.auth.callback_urls
}

output "cognito_logout_urls" {
  description = "Logout URLs registered with the Cognito frontend app client."
  value       = module.auth.logout_urls
}

output "backend_kubernetes_namespace" {
  description = "Kubernetes namespace managed for the backend."
  value       = module.backend_config.namespace
}

output "backend_config_map_name" {
  description = "Kubernetes ConfigMap containing non-secret backend runtime configuration."
  value       = module.backend_config.config_map_name
}
