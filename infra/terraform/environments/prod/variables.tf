variable "project_name" {
  description = "Project name for AWS resource naming."
  type        = string
  default     = "seamarg"
}

variable "environment" {
  description = "Environment name for resource naming and tagging."
  type        = string
  default     = "prod"
}

variable "aws_region" {
  description = "AWS region for the environment."
  type        = string
  default     = "ap-south-1"
}

variable "github_repository_full_name" {
  description = "GitHub repository in owner/name format. Set by GitHub Actions using github.repository."
  type        = string
  default     = null
}

variable "github_oidc_subjects" {
  description = "Optional explicit GitHub OIDC subjects allowed to assume the deployment role."
  type        = list(string)
  default     = []
}

variable "create_github_oidc_provider" {
  description = "Create GitHub Actions OIDC provider. Set false if this AWS account already has one."
  type        = bool
  default     = false
}

variable "github_oidc_provider_arn" {
  description = "Existing GitHub Actions OIDC provider ARN when create_github_oidc_provider is false."
  type        = string
  default     = null
}

variable "backend_admin_username" {
  description = "Non-secret admin username written to the backend Kubernetes ConfigMap."
  type        = string
  default     = "admin"
}

variable "backend_admin_role" {
  description = "Non-secret admin role written to the backend Kubernetes ConfigMap."
  type        = string
  default     = "ADMIN"
}
