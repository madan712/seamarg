variable "project_name" {
  description = "Project name used for backend runtime AWS resource names."
  type        = string
  default     = "seamarg"
}

variable "environment" {
  description = "Environment name for backend runtime resources."
  type        = string
}

variable "backend_runtime_data_policy_arn" {
  description = "IAM policy ARN that grants backend access to the certificate S3 bucket and app data DynamoDB table."
  type        = string
}

variable "backend_ec2_role_name" {
  description = "Optional explicit backend EC2 IAM role name. Defaults to <project>-<environment>-backend-ec2."
  type        = string
  default     = null
}

variable "backend_ec2_instance_profile_name" {
  description = "Optional explicit backend EC2 instance profile name. Defaults to <project>-<environment>-backend-ec2."
  type        = string
  default     = null
}

variable "tags" {
  description = "Additional tags for backend runtime resources."
  type        = map(string)
  default     = {}
}
