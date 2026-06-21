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
