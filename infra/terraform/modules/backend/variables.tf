variable "project_name" {
  description = "Project name used for AWS resource names."
  type        = string
  default     = "seamarg"
}

variable "environment" {
  description = "Environment name for backend resources."
  type        = string
}

variable "aws_region" {
  description = "AWS region for backend resources."
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for the EKS VPC."
  type        = string
  default     = "10.40.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "Public subnet CIDR blocks used by the starter EKS node group."
  type        = list(string)
  default     = ["10.40.0.0/20", "10.40.16.0/20"]
}

variable "node_instance_types" {
  description = "EC2 instance types for the managed EKS node group."
  type        = list(string)
  default     = ["t3.medium"]
}

variable "node_desired_size" {
  description = "Desired node count for the managed EKS node group."
  type        = number
  default     = 2
}

variable "node_min_size" {
  description = "Minimum node count for the managed EKS node group."
  type        = number
  default     = 1
}

variable "node_max_size" {
  description = "Maximum node count for the managed EKS node group."
  type        = number
  default     = 3
}

variable "github_repository_full_name" {
  description = "GitHub repository in owner/name format. Set this to create an OIDC deployment role."
  type        = string
  default     = null
}

variable "github_oidc_subjects" {
  description = "Optional explicit GitHub OIDC subject claims allowed to assume the deployment role."
  type        = list(string)
  default     = []
}

variable "create_github_oidc_provider" {
  description = "Create the account-level GitHub Actions OIDC provider. Set false if the account already has one."
  type        = bool
  default     = false
}

variable "github_oidc_provider_arn" {
  description = "Existing GitHub Actions OIDC provider ARN, required when create_github_oidc_provider is false and github_repository_full_name is set."
  type        = string
  default     = null
}

variable "tags" {
  description = "Additional tags for backend resources."
  type        = map(string)
  default     = {}
}
