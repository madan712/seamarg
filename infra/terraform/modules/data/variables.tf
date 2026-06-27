variable "project_name" {
  description = "Project name used for AWS resource names."
  type        = string
  default     = "seamarg"
}

variable "environment" {
  description = "Environment name for resource naming and tagging."
  type        = string
}

variable "force_destroy_documents_bucket" {
  description = "Allow Terraform to delete the documents bucket even when it contains objects."
  type        = bool
  default     = false
}

variable "point_in_time_recovery_enabled" {
  description = "Enable DynamoDB point-in-time recovery for the generic backend data table."
  type        = bool
  default     = true
}

variable "tags" {
  description = "Additional tags for data resources."
  type        = map(string)
  default     = {}
}
