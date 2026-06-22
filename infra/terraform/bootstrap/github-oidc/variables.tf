variable "project_name" {
  description = "Project name for AWS resource tagging."
  type        = string
  default     = "seamarg"
}

variable "aws_region" {
  description = "AWS region used for provider configuration."
  type        = string
  default     = "ap-south-1"
}
