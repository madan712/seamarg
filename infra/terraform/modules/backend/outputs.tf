output "name" {
  description = "Backend module name."
  value       = "seamarg-backend-${var.environment}"
}

output "ecr_repository_name" {
  description = "Backend ECR repository name."
  value       = aws_ecr_repository.backend.name
}

output "ecr_repository_url" {
  description = "Backend ECR repository URL."
  value       = aws_ecr_repository.backend.repository_url
}

output "eks_cluster_name" {
  description = "EKS cluster name."
  value       = aws_eks_cluster.this.name
}

output "github_actions_role_arn" {
  description = "GitHub Actions deployment role ARN, if created."
  value       = try(aws_iam_role.github_actions[0].arn, null)
}

output "vpc_id" {
  description = "EKS VPC ID."
  value       = aws_vpc.this.id
}

output "public_subnet_ids" {
  description = "Public subnet IDs used by EKS."
  value       = aws_subnet.public[*].id
}
