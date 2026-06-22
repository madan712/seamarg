variable "project_name" {
  description = "Project name used for Cognito resource names."
  type        = string
  default     = "seamarg"
}

variable "environment" {
  description = "Environment name for Cognito resources."
  type        = string
}

variable "aws_region" {
  description = "AWS region where the Cognito user pool is created."
  type        = string
}

variable "frontend_cloudfront_domain_name" {
  description = "CloudFront domain name to register as an allowed Cognito callback and logout URL."
  type        = string
  default     = null
}

variable "include_localhost_callback_urls" {
  description = "Include localhost callback and logout URLs for local frontend development."
  type        = bool
  default     = true
}

variable "localhost_callback_urls" {
  description = "Local frontend URLs allowed for Cognito callback and logout during development."
  type        = list(string)
  default     = ["http://localhost:5173"]
}

variable "callback_urls" {
  description = "Additional Cognito callback URLs."
  type        = list(string)
  default     = []
}

variable "logout_urls" {
  description = "Additional Cognito logout URLs."
  type        = list(string)
  default     = []
}

variable "enable_self_registration" {
  description = "Allow customers to sign themselves up."
  type        = bool
  default     = true
}

variable "mfa_configuration" {
  description = "Cognito MFA mode for customer users."
  type        = string
  default     = "OPTIONAL"

  validation {
    condition     = contains(["OFF", "ON", "OPTIONAL"], var.mfa_configuration)
    error_message = "mfa_configuration must be OFF, ON, or OPTIONAL."
  }
}

variable "deletion_protection" {
  description = "Cognito deletion protection mode."
  type        = string
  default     = "ACTIVE"

  validation {
    condition     = contains(["ACTIVE", "INACTIVE"], var.deletion_protection)
    error_message = "deletion_protection must be ACTIVE or INACTIVE."
  }
}

variable "password_minimum_length" {
  description = "Minimum password length for customer accounts."
  type        = number
  default     = 12

  validation {
    condition     = var.password_minimum_length >= 8
    error_message = "password_minimum_length must be at least 8."
  }
}

variable "access_token_validity_hours" {
  description = "Cognito access token lifetime in hours."
  type        = number
  default     = 1
}

variable "id_token_validity_hours" {
  description = "Cognito ID token lifetime in hours."
  type        = number
  default     = 1
}

variable "refresh_token_validity_days" {
  description = "Cognito refresh token lifetime in days."
  type        = number
  default     = 30
}

variable "tags" {
  description = "Additional tags for Cognito resources."
  type        = map(string)
  default     = {}
}
