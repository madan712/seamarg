variable "project_name" {
  description = "Project name used for AWS resource names."
  type        = string
  default     = "seamarg"
}

variable "environment" {
  description = "Environment name for deployment resources."
  type        = string
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
  description = "Additional tags for deployment resources."
  type        = map(string)
  default     = {}
}
