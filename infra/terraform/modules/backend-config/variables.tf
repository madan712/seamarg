variable "project_name" {
  description = "Project name used for Kubernetes labels."
  type        = string
}

variable "environment" {
  description = "Environment name used for Kubernetes labels."
  type        = string
}

variable "namespace" {
  description = "Kubernetes namespace for the backend."
  type        = string
  default     = "seamarg"
}

variable "config_map_name" {
  description = "Kubernetes ConfigMap name for backend non-secret runtime configuration."
  type        = string
  default     = "seamarg-backend-config"
}

variable "cognito_issuer_uri" {
  description = "Cognito issuer URI used by the backend resource server JWT decoder."
  type        = string
}

variable "admin_username" {
  description = "Non-secret admin username exposed to the backend."
  type        = string
  default     = "admin"
}

variable "admin_role" {
  description = "Non-secret admin role exposed to the backend."
  type        = string
  default     = "ADMIN"
}
