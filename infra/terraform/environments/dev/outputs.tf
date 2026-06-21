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
